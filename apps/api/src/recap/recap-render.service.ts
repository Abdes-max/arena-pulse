import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { MatchRecapProps } from './composition/schema';

const COMPOSITION_ID = 'MatchRecap';

@Injectable()
export class RecapRenderService {
  private readonly logger = new Logger(RecapRenderService.name);

  // bundle() runs a webpack pass over the composition and is expensive
  // (multi-second) -- the composition source never changes at runtime, so
  // the first render in this process pays for it and every render after
  // reuses the same bundle. Reset on failure so a transient error doesn't
  // permanently poison later renders.
  private bundleLocationPromise: Promise<string> | null = null;

  private getBundleLocation(): Promise<string> {
    if (!this.bundleLocationPromise) {
      this.bundleLocationPromise = bundle({
        entryPoint: path.join(__dirname, 'composition', 'index.js'),
      }).catch((error: unknown) => {
        this.bundleLocationPromise = null;
        throw error;
      });
    }
    return this.bundleLocationPromise;
  }

  async renderMatchRecap(props: MatchRecapProps): Promise<Buffer> {
    const serveUrl = await this.getBundleLocation();
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps: props,
    });

    const outputLocation = path.join(os.tmpdir(), `recap-${randomUUID()}.mp4`);
    try {
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation,
        inputProps: props,
        // Recommended for Docker/Linux -- see infra/docker/api.Dockerfile.
        chromiumOptions: { enableMultiProcessOnLinux: true },
      });
      return await fs.readFile(outputLocation);
    } finally {
      await fs.rm(outputLocation, { force: true }).catch((error: unknown) => {
        this.logger.warn(
          `Échec du nettoyage du fichier temporaire de recap : ${String(error)}`,
        );
      });
    }
  }
}
