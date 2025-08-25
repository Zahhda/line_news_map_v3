// src/utils/rss.js
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000, requestOptions: { timeout: 10000 } });

function cleanText(input = '') {
  return String(input).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(d) {
  if (!d) return null;
  try {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t.toISOString();
  } catch { return null; }
}

function extractImage(it) {
  if (it?.enclosure?.url) return it.enclosure.url;
  if (it?.['media:content']?.url) return it['media:content'].url;
  const html = it?.content || it?.['content:encoded'] || '';
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

export async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || [])
      .map(it => {
        const title = cleanText(it.title || '');
        const summary = cleanText(it.contentSnippet || it.content || it.summary || '');
        const link = it.link || '';
        const isoDate = toIsoDate(it.isoDate || it.pubDate || null);
        const image = extractImage(it);
        const source = (feed && feed.title) || '';
        return { title, summary, link, isoDate, image, source };
      })
      .filter(it => it.title || it.link);
    return items;
  } catch (e) {
    console.error('Feed error', url, e?.message || e);
    return [];
  }
}
