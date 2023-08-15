import { resetEntityCounter } from '@antv/g';
import legend from '../demo/plugins/legend';
import './utils/useSnapshotMatchers';
import { createContext, triggerEvent } from './utils';
import { createNodeGCanvas } from './utils/createNodeGCanvas';

describe('Plugin legend', () => {
  beforeEach(() => {
    /**
     * SVG Snapshot testing will generate a unique id for each element.
     * Reset to 0 to keep snapshot consistent.
     */
    resetEntityCounter();
  });

  it('should be rendered correctly with Canvas2D', (done) => {
    const dir = `${__dirname}/snapshots/canvas`;
    const { backgroundCanvas, canvas, transientCanvas, container } =
      createContext('canvas', 500, 500);
    const legendCanvas = createNodeGCanvas('canvas', 200, 200);

    const graph = legend({
      container,
      backgroundCanvas,
      canvas,
      transientCanvas,
      width: 500,
      height: 500,
      legendCanvas,
    });

    const plugin =
      graph['pluginController']['pluginMap'].get('legend1')!.plugin;

    graph.on('afterlayout', async () => {
      await expect(legendCanvas).toMatchCanvasSnapshot(dir, 'plugins-legend');

      /**
       * Select nodeb mark by click.
       */
      triggerEvent(plugin, 'mousedown', 72, 56);
      triggerEvent(plugin, 'mouseup', 72, 56);
      await expect(legendCanvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-select-marker',
      );
      await expect(canvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-select-node',
      );

      /**
       * Click document to clear filter state.
       */
      triggerEvent(plugin, 'mousedown', 0, 0);
      triggerEvent(plugin, 'mouseup', 0, 0);
      await expect(legendCanvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-deselect-marker',
      );
      await expect(canvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-deselect-node',
      );

      /**
       * Activate nodeb mark by mouseenter.
       */
      triggerEvent(plugin, 'mousemove', 72, 80);
      triggerEvent(plugin, 'mousemove', 72, 56);
      await expect(legendCanvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-activate-marker',
      );
      await expect(canvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-activate-node',
      );

      /**
       * Deactivate nodeb mark by mouseleave.
       */
      triggerEvent(plugin, 'mousemove', 72, 80);
      await expect(legendCanvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-deactivate-marker',
      );
      await expect(canvas).toMatchCanvasSnapshot(
        dir,
        'plugins-legend-deactivate-node',
      );

      graph.destroy();
      done();
    });
  });

  it('should be rendered correctly with SVG', (done) => {
    const dir = `${__dirname}/snapshots/svg`;
    const { backgroundCanvas, canvas, transientCanvas, container } =
      createContext('svg', 500, 500);
    const legendCanvas = createNodeGCanvas('svg', 200, 200);

    const graph = legend({
      container,
      backgroundCanvas,
      canvas,
      transientCanvas,
      width: 500,
      height: 500,
      legendCanvas,
    });

    graph.on('afterlayout', async () => {
      await expect(legendCanvas).toMatchSVGSnapshot(dir, 'plugins-legend');
      graph.destroy();
      done();
    });
  });
});
