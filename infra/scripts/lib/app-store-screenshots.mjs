// Replaces an App Store version's screenshots with the PNGs committed under
// apps/mobile/store-assets/app-store (see build-store-screenshots.mjs), via
// the App Store Connect API's reserve -> upload -> commit flow. Used by
// submit-ios-app-store.mjs before submitting: Apple locks screenshots once
// a version is in review.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Folder -> App Store Connect display type.
const SETS = [
  { folder: 'screenshots-6.5in', displayType: 'APP_IPHONE_65' },
  { folder: 'screenshots-ipad-13in', displayType: 'APP_IPAD_PRO_3GEN_129' },
];

async function uploadOne(api, setId, filePath) {
  const bytes = readFileSync(filePath);
  const fileName = filePath.split(/[\\/]/).pop();
  const reserved = await api('POST', '/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  });
  const screenshot = reserved.data;
  const operations = screenshot.attributes.uploadOperations ?? [];
  console.log(`    ${fileName}: ${bytes.length} bytes, ${operations.length} upload part(s)`);
  for (const [index, op] of operations.entries()) {
    // Node's fetch sets Content-Length itself from the body (and rejects a
    // hand-set one), so Apple's own value is left out.
    const headers = Object.fromEntries(
      (op.requestHeaders ?? [])
        .filter((h) => h.name.toLowerCase() !== 'content-length')
        .map((h) => [h.name, h.value]),
    );
    const body = bytes.subarray(op.offset, op.offset + op.length);
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers,
          body,
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${await res.text()}`);
        }
        break;
      } catch (error) {
        const cause = error.cause ? ` (${error.cause.code ?? error.cause.message})` : '';
        const message = `Upload of ${fileName} part ${index + 1} failed: ${error.message}${cause}`;
        if (attempt >= 3) {
          throw new Error(message);
        }
        console.warn(`    ${message} -- retrying`);
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
  }
  await api('PATCH', `/appScreenshots/${screenshot.id}`, {
    data: {
      type: 'appScreenshots',
      id: screenshot.id,
      attributes: {
        uploaded: true,
        sourceFileChecksum: createHash('md5').update(bytes).digest('hex'),
      },
    },
  });
  return screenshot.id;
}

/** Waits until Apple has processed every uploaded screenshot (submission refuses them otherwise). */
async function waitProcessed(api, ids) {
  const deadline = Date.now() + 5 * 60 * 1000;
  for (const id of ids) {
    for (;;) {
      const res = await api(
        'GET',
        `/appScreenshots/${id}?fields[appScreenshots]=assetDeliveryState`,
      );
      const state = res.data.attributes.assetDeliveryState?.state;
      if (state === 'COMPLETE') {
        break;
      }
      if (state === 'FAILED') {
        const errors = JSON.stringify(res.data.attributes.assetDeliveryState?.errors ?? []);
        throw new Error(`Screenshot ${id} was rejected by App Store Connect: ${errors}`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Screenshot ${id} still processing after 5 minutes.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * @param api (method, path, body?) => Promise<json> -- authenticated App Store Connect call
 * @param localizationIds appStoreVersionLocalization ids to update
 * @param dir apps/mobile/store-assets/app-store
 */
export async function replaceScreenshots(api, localizationIds, dir) {
  const uploaded = [];
  for (const localizationId of localizationIds) {
    const existingSets = await api(
      'GET',
      `/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`,
    );
    for (const { folder, displayType } of SETS) {
      const files = readdirSync(join(dir, folder))
        .filter((name) => name.endsWith('.png'))
        .sort();
      if (files.length === 0) {
        continue;
      }
      let set = existingSets.data.find((s) => s.attributes.screenshotDisplayType === displayType);
      if (!set) {
        const created = await api('POST', '/appScreenshotSets', {
          data: {
            type: 'appScreenshotSets',
            attributes: { screenshotDisplayType: displayType },
            relationships: {
              appStoreVersionLocalization: {
                data: { type: 'appStoreVersionLocalizations', id: localizationId },
              },
            },
          },
        });
        set = created.data;
      }
      const current = await api('GET', `/appScreenshotSets/${set.id}/appScreenshots`);
      for (const old of current.data) {
        await api('DELETE', `/appScreenshots/${old.id}`);
      }
      const ids = [];
      for (const file of files) {
        ids.push(await uploadOne(api, set.id, join(dir, folder, file)));
      }
      // Display order = file name order (1-..., 2-...).
      await api('PATCH', `/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
        data: ids.map((id) => ({ type: 'appScreenshots', id })),
      });
      console.log(`  → ${displayType}: ${ids.length} screenshot(s) uploaded.`);
      uploaded.push(...ids);
    }
  }
  console.log('Waiting for App Store Connect to process the screenshots...');
  await waitProcessed(api, uploaded);
}
