const { google } = require('googleapis');
const { getAuthClient } = require('./auth');

// Standard 16:9 slide dimensions in EMU (English Metric Units)
const DEFAULT_SLIDE_WIDTH_EMU = 9144000;
const DEFAULT_SLIDE_HEIGHT_EMU = 5143500;

function extractDurationFromNotes(notes) {
  if (!notes) return null;
  const match = notes.match(/\[duration:([^\]]+)\]/i);
  if (!match) return null;
  const value = match[1].trim().toLowerCase();
  if (value === 'video') return 'video';
  const seconds = parseFloat(value);
  if (!isNaN(seconds) && seconds > 0) return Math.round(seconds * 1000);
  return null;
}

function extractNotesText(slide) {
  let text = '';
  const elements = slide.slideProperties?.notesPage?.pageElements;
  if (!elements) return text;
  for (const el of elements) {
    // Skip the slide image placeholder
    if (el.shape?.placeholder?.type === 'SLIDE_IMAGE') continue;
    const textElements = el.shape?.text?.textElements;
    if (!textElements) continue;
    for (const te of textElements) {
      if (te.textRun?.content) text += te.textRun.content;
    }
  }
  return text;
}

function extractVideoFromElements(elements, slideWidthEmu, slideHeightEmu) {
  if (!elements) return null;
  for (const el of elements) {
    if (!el.video) continue;
    const transform = el.transform || {};
    const size = el.size || {};

    const tx = transform.translateX || 0;
    const ty = transform.translateY || 0;
    const sx = transform.scaleX != null ? transform.scaleX : 1;
    const sy = transform.scaleY != null ? transform.scaleY : 1;
    const w = (size.width?.magnitude || 0) * sx;
    const h = (size.height?.magnitude || 0) * sy;

    return {
      source: el.video.source,  // 'DRIVE' or 'YOUTUBE'
      fileId: el.video.id,
      position: {
        x: (tx / slideWidthEmu) * 100,
        y: (ty / slideHeightEmu) * 100,
        width: (w / slideWidthEmu) * 100,
        height: (h / slideHeightEmu) * 100
      }
    };
  }
  return null;
}

async function fetchPresentationData(presentationId) {
  const auth = await getAuthClient();
  const slidesApi = google.slides({ version: 'v1', auth });
  const driveApi = google.drive({ version: 'v3', auth });

  const presentation = await slidesApi.presentations.get({ presentationId });

  const data = presentation.data;
  const title = data.title || 'Untitled Presentation';

  const slideWidth = data.pageSize?.width?.magnitude || DEFAULT_SLIDE_WIDTH_EMU;
  const slideHeight = data.pageSize?.height?.magnitude || DEFAULT_SLIDE_HEIGHT_EMU;

  const slideData = await Promise.all(
    (data.slides || []).map(async (slide, index) => {
      const pageId = slide.objectId;
      const notesText = extractNotesText(slide);
      const parsedDuration = extractDurationFromNotes(notesText);
      const video = extractVideoFromElements(slide.pageElements, slideWidth, slideHeight);

      // Determine advance behavior
      const waitForVideo = parsedDuration === 'video' || (!!video && parsedDuration === null);
      const fixedDuration = parsedDuration === 'video' ? null : parsedDuration;

      // Fetch Drive video duration so we can auto-advance reliably
      let videoDurationMs = null;
      if (video && video.source === 'DRIVE' && waitForVideo) {
        try {
          const fileRes = await driveApi.files.get({
            fileId: video.fileId,
            fields: 'videoMediaMetadata'
          });
          const ms = parseInt(fileRes.data.videoMediaMetadata?.durationMillis);
          if (!isNaN(ms) && ms > 0) videoDurationMs = ms;
        } catch (e) {
          console.warn(`Could not fetch Drive video duration for ${video.fileId}: ${e.message}`);
        }
      }

      return {
        index,
        pageId,
        hasVideo: !!video,
        video: video || null,
        videoDurationMs,
        waitForVideo,
        duration: fixedDuration  // ms, or null (fall back to show default)
      };
    })
  );

  return { title, slides: slideData };
}

async function fetchSlideThumbnails(presentationId, pageIds) {
  const auth = await getAuthClient();
  const slidesApi = google.slides({ version: 'v1', auth });

  const results = await Promise.allSettled(
    pageIds.map(pageId =>
      slidesApi.presentations.pages.getThumbnail({
        presentationId,
        pageObjectId: pageId,
        'thumbnailProperties.thumbnailSize': 'LARGE'
      })
    )
  );

  const urlMap = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      urlMap[pageIds[i]] = result.value.data.contentUrl || null;
    } else {
      console.warn(`Thumbnail failed for ${pageIds[i]}: ${result.reason?.message}`);
      urlMap[pageIds[i]] = null;
    }
  });
  return urlMap;
}

module.exports = { fetchPresentationData, fetchSlideThumbnails };
