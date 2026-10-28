import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBilibiliVideoUrl,
  isBilibiliBvId,
  normalizeBilibiliVideo,
  parseBilibiliVideoDetail,
  parseBilibiliVideoList,
  toSecureBilibiliImageUrl
} from '../src/main/services/bilibili/video';

const POPULAR_PAYLOAD = {
  code: 0,
  message: 'OK',
  data: {
    list: [
      {
        bvid: 'BV1xx411c7mD',
        title: '<em>胡桃</em> &amp; 一段小测试',
        pic: 'http://i0.hdslb.com/bfs/archive/demo.jpg',
        duration: 123,
        pubdate: 1_700_000_000,
        owner: { name: '往生堂' },
        stat: { view: 12345, danmaku: 67 },
        tname: '鬼畜'
      }
    ]
  }
};

test('normalizeBilibiliVideo 清洗标题、封面与链接', () => {
  const video = normalizeBilibiliVideo(POPULAR_PAYLOAD.data.list[0]);

  assert.ok(video);
  assert.equal(video.bvid, 'BV1xx411c7mD');
  assert.equal(video.title, '胡桃 & 一段小测试');
  assert.equal(video.coverUrl, 'https://i0.hdslb.com/bfs/archive/demo.jpg');
  assert.equal(video.upName, '往生堂');
  assert.equal(video.viewCount, 12345);
  assert.equal(video.danmakuCount, 67);
  assert.equal(video.url, getBilibiliVideoUrl('BV1xx411c7mD'));
  assert.equal(video.publishedAt, new Date(1_700_000_000 * 1000).toISOString());
});

test('normalizeBilibiliVideo 拒绝非法 bvid、空标题和异常时长', () => {
  assert.equal(normalizeBilibiliVideo({ bvid: 'not-a-bv', title: 'x', duration: 10 }), null);
  assert.equal(normalizeBilibiliVideo({ bvid: 'BV1xx411c7mD', title: '   ', duration: 10 }), null);
  assert.equal(normalizeBilibiliVideo({ bvid: 'BV1xx411c7mD', title: 'x', duration: 0 }), null);
});

test('封面只允许 B 站图床并强制 https', () => {
  assert.equal(toSecureBilibiliImageUrl('http://i1.hdslb.com/a.png'), 'https://i1.hdslb.com/a.png');
  assert.equal(toSecureBilibiliImageUrl('https://evil.example.com/a.png'), null);
  assert.equal(toSecureBilibiliImageUrl('javascript:alert(1)'), null);
});

test('parseBilibiliVideoList 同时兼容 list 与 archives', () => {
  assert.equal(parseBilibiliVideoList(POPULAR_PAYLOAD).length, 1);

  const archives = parseBilibiliVideoList({
    code: 0,
    data: {
      archives: [
        {
          bvid: 'BV1yy411c7mD',
          title: '分区新稿',
          pic: 'https://i2.hdslb.com/b.jpg',
          duration: 300,
          pubdate: 1_700_000_100,
          owner: { name: 'UP' },
          stat: { view: 9999, danmaku: 1 },
          tname: '游戏'
        }
      ]
    }
  });

  assert.equal(archives.length, 1);
  assert.equal(archives[0].category, '游戏');
});

test('parseBilibiliVideoDetail 读取稿件详情', () => {
  const detail = parseBilibiliVideoDetail({
    code: 0,
    data: {
      bvid: 'BV1zz411c7mD',
      title: '详情',
      pic: 'http://i0.hdslb.com/c.jpg',
      duration: 66,
      pubdate: 1_700_000_000,
      owner: { name: 'UP' },
      stat: { view: 1000, danmaku: 2 },
      tname: '生活'
    }
  });

  assert.equal(detail?.bvid, 'BV1zz411c7mD');
  assert.equal(parseBilibiliVideoDetail({ code: -404 }), null);
});

test('isBilibiliBvId 校验格式', () => {
  assert.equal(isBilibiliBvId('BV1xx411c7mD'), true);
  assert.equal(isBilibiliBvId('BV123'), false);
  assert.equal(isBilibiliBvId(undefined), false);
});
