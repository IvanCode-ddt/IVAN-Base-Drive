import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/database.js';
import { validatePost } from '../server/posts.js';
import { detailHTML } from '../js/content.js';
import { exportStatic } from '../scripts/export-static.mjs';

const basePost = {
  title: 'Large game', slug: 'large-game', category: 'game',
  description: 'Game description', introduction: '', instructions: '',
  images: [], status: 'published',
};
const externalLinks = [
  { name: 'Tải trực tiếp', url: 'https://downloads.example.test/game.zip', kind: 'direct', provider: 'Example host', size: '80 GB' },
  { name: 'Trang tải dự phòng', url: 'https://example.test/download', kind: 'download_page', provider: '', size: '' },
];

test('external download links require HTTPS, safe URLs, a name and a supported type', () => {
  const saved = validatePost({ ...basePost, external_links: externalLinks });
  assert.equal(saved.external_links[0].url, 'https://downloads.example.test/game.zip');
  assert.equal(saved.external_links[1].kind, 'download_page');
  assert.equal(validatePost({ ...basePost, external_links: [{ ...externalLinks[0], url: 'https://example.test/manual#author' }] }).external_links[0].url, 'https://example.test/manual#author');
  assert.ok(!Object.hasOwn(validatePost(basePost), 'external_links'));

  for (const url of [
    'http://example.test/file.zip', 'javascript:alert(1)', 'data:text/html,test',
    'file:///secret', 'https://user:password@example.test/file',
    'https://example.test/file?access_token=secret',
    'https://example.test/file?X-Amz-Signature=secret',
    'https://example.test/file#access_token=secret',
  ]) assert.throws(() => validatePost({ ...basePost, external_links: [{ ...externalLinks[0], url }] }), /HTTPS/);
  assert.throws(() => validatePost({ ...basePost, external_links: [{ ...externalLinks[0], name: '' }] }), /name/);
  assert.throws(() => validatePost({ ...basePost, external_links: [{ ...externalLinks[0], kind: 'proxy' }] }), /Loại liên kết/);
});

test('external links render inside the existing download panel with safe new-tab links', () => {
  const html = detailHTML({ ...basePost, external_links: externalLinks });
  assert.equal((html.match(/class="download-file"/g) || []).length, 2);
  assert.match(html, /Tải xuống · Tải trực tiếp/);
  assert.match(html, /Mở trang tải · Trang tải dự phòng/);
  assert.match(html, /Nguồn: Example host/);
  assert.match(html, /Dung lượng: 80 GB/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Liên kết ngoài có thể thay đổi/);
  assert.doesNotMatch(html, /javascript:/);

  const onlyLink = detailHTML({ ...basePost, external_links: [externalLinks[0]] });
  assert.match(onlyLink, /class="primary-button download-link"/);
  const oldPost = detailHTML(basePost);
  assert.match(oldPost, /Chưa có liên kết tải được công khai/);
  const combined = detailHTML({
    ...basePost, external_links: [externalLinks[0]],
    drive_files: [{
      file_id: 'public-drive', name: 'Drive archive', can_download: 1, sharing_confirmed: 1,
      sharing_access: 'anyone', download_url: 'https://drive.google.com/uc?export=download&id=public-drive',
      web_url: 'https://drive.google.com/file/d/public-drive/view',
    }],
  });
  assert.match(combined, /Drive archive/);
  assert.match(combined, /Tải xuống · Tải trực tiếp/);
});

test('admin can edit external links without changing Drive files and export them to static Pages', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ivan-external-links-'));
  const databasePath = path.join(directory, 'ivan.sqlite');
  const outputDir = path.join(directory, 'docs');
  const db = openDatabase(databasePath);
  const config = {
    baseUrl: 'http://localhost:3000',
    redirectUri: 'http://localhost:3000/auth/google/callback',
    adminEmail: 'admin@example.com', clientId: 'test', clientSecret: 'test',
    sessionSecret: randomBytes(40).toString('hex'), secure: false,
  };
  let pending;
  const oauth = {
    generateAuthUrl(params) { pending = params; return 'https://accounts.google.com/auth'; },
    async getToken() { return { tokens: { id_token: 'test' } }; },
    async verifyIdToken() {
      return { getPayload: () => ({ sub: 'admin', email: config.adminEmail, email_verified: true, nonce: pending.nonce }) };
    },
  };
  const app = createApp({ config, db, oauthClient: oauth });
  const agent = request.agent(app);
  try {
    await agent.get('/auth/google');
    await agent.get('/auth/google/callback').query({ state: pending.state, code: 'ok' }).expect(302);
    const csrf = (await agent.get('/api/admin/session')).body.csrfToken;
    const write = (method, url, body) => agent[method](url)
      .set('Origin', config.baseUrl).set('X-CSRF-Token', csrf).send(body);

    const created = (await write('post', '/api/admin/posts', { ...basePost, external_links: externalLinks }).expect(201)).body;
    const driveFile = {
      file_id: 'preserved_drive_file', name: 'Existing Drive file', mime_type: 'application/zip',
      size: '100', modified_time: '', web_url: 'https://drive.google.com/file/d/preserved_drive_file/view',
    };
    db.linkFile(created.id, driveFile);
    const edited = (await write('put', `/api/admin/posts/${created.id}`, {
      ...basePost, external_links: [externalLinks[1]],
    }).expect(200)).body;
    assert.equal(edited.external_links.length, 1);
    assert.equal(edited.external_links[0].name, 'Trang tải dự phòng');
    assert.deepEqual(db.linkedFiles(created.id).map(file => file.file_id), [driveFile.file_id]);
    assert.equal((await request(app).get('/api/posts/large-game')).body.external_links.length, 1);

    await exportStatic({ databasePath, outputDir });
    const payload = JSON.parse(await readFile(path.join(outputDir, 'content', 'posts.json'), 'utf8'));
    assert.deepEqual(payload.posts[0].external_links.map(link => link.name), ['Trang tải dự phòng']);
    const staticApp = express();
    staticApp.use('/IVAN-Base-Drive', express.static(outputDir));
    const server = staticApp.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const origin = `http://127.0.0.1:${server.address().port}/IVAN-Base-Drive`;
      const response = await fetch(`${origin}/content/posts.json`);
      assert.equal(response.status, 200);
      const staticPost = (await response.json()).posts[0];
      assert.equal(staticPost.external_links[0].kind, 'download_page');
      assert.match(detailHTML(staticPost), /Mở trang tải · Trang tải dự phòng/);
      assert.equal((await fetch(`${origin}/api/posts/large-game`)).status, 404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration adds the external-link table without changing existing posts or Drive attachments', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ivan-external-migration-'));
  const databasePath = path.join(directory, 'ivan.sqlite');
  let db;
  try {
    db = openDatabase(databasePath);
    const post = db.create(validatePost(basePost));
    const file = {
      file_id: 'legacy_drive_file', name: 'Legacy Drive file', mime_type: 'application/zip',
      size: '200', modified_time: '', web_url: 'https://drive.google.com/file/d/legacy_drive_file/view',
    };
    db.linkFile(post.id, file);
    db.close();
    db = null;

    const legacy = new DatabaseSync(databasePath);
    legacy.exec('DROP TABLE post_external_links; PRAGMA user_version=13;');
    legacy.close();

    db = openDatabase(databasePath);
    assert.equal(db.get(post.id).title, basePost.title);
    assert.deepEqual(db.linkedFiles(post.id).map(item => item.file_id), [file.file_id]);
    assert.deepEqual(db.externalLinks(post.id), []);
    const migrated = new DatabaseSync(databasePath);
    assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, 14);
    migrated.close();
  } finally {
    db?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
