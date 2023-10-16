import { Group } from '@antv/g';
import { clone } from '@antv/util';
import { Point } from '../types/common';
import { ComboDisplayModel, ComboModel, IGraph, NodeModel } from '../types';
import { DisplayMapper, State, LodStrategyObj } from '../types/item';
import { NodeDisplayModel, NodeModelData } from '../types/node';
import { ComboStyleSet, NodeStyleSet } from '../types/theme';
import { updateShapes } from '../util/shape';
import { animateShapes, getAnimatesExcludePosition } from '../util/animate';
import {
  getCircleIntersectByPoint,
  getEllipseIntersectByPoint,
  getNearestPoint,
  getRectIntersectByPoint,
} from '../util/point';
import { ComboModelData } from '../types/combo';
import Item from './item';

interface IProps {
  graph: IGraph;
  model: NodeModel | ComboModel;
  renderExtensions: any;
  containerGroup: Group;
  labelContainerGroup?: Group; // TODO: optional?
  mapper?: DisplayMapper;
  stateMapper?: {
    [stateName: string]: DisplayMapper;
  };
  zoom?: number;
  theme: {
    styles: NodeStyleSet | ComboStyleSet;
    lodStrategy: LodStrategyObj;
  };
  device?: any; // for 3d shapes
  onframe?: Function;
  onfinish?: Function;
  type?: 'node' | 'combo';
  delayFirstDraw?: boolean;
}
export default class Node extends Item {
  public type: 'node' | 'combo';

  constructor(props: IProps) {
    super(props);
    this.init({ ...props, type: props.type || 'node' });
    if (!props.delayFirstDraw) {
      this.draw(
        this.displayModel as NodeDisplayModel | ComboDisplayModel,
        undefined,
        undefined,
        !this.displayModel.data.disableAnimate,
        props.onfinish,
      );
    }
  }
  public draw(
    displayModel: NodeDisplayModel | ComboDisplayModel,
    diffData?: {
      previous: NodeModelData | ComboModelData;
      current: NodeModelData | ComboModelData;
    },
    diffState?: { previous: State[]; current: State[] },
    animate = true,
    onfinish: Function = () => {},
  ) {
    const {
      group,
      labelGroup,
      renderExt,
      shapeMap: prevShapeMap,
      model,
      graph,
    } = this;
    renderExt.mergeStyles(displayModel);

    const firstRendering = !this.shapeMap?.keyShape;
    const shapeMap = renderExt.draw(
      displayModel,
      this.shapeMap,
      diffData,
      diffState,
    );
    shapeMap.labelShape?.setAttribute('data-is-label', true);
    shapeMap.labelBackgroundShape?.setAttribute(
      'data-is-label-background',
      true,
    );

    // add shapes to group, and update shapeMap
    this.shapeMap = updateShapes(prevShapeMap, shapeMap, group, labelGroup);

    const { animates, disableAnimate, x = 0, y = 0, z = 0 } = displayModel.data;
    if (firstRendering) {
      // first rendering, move the group
      group.style.x = x;
      group.style.y = y;
      group.style.z = z;
      const viewportPosition = graph.getViewportByCanvas({ x, y, z });
      labelGroup.style.x = viewportPosition.x;
      labelGroup.style.y = viewportPosition.y;
      labelGroup.style.z = viewportPosition.z;
    } else {
      // terminate previous animations
      this.stopAnimations();
      this.updatePosition(displayModel, diffData, animate, onfinish);
    }

    const { haloShape } = this.shapeMap;
    haloShape?.toBack();

    super.draw(displayModel, diffData, diffState, animate, onfinish);
    renderExt.updateCache(this.shapeMap);

    if (firstRendering) {
      // update the transform
      renderExt.onZoom(this.shapeMap, this.zoom);
    }

    // handle shape's and group's animate
    if (animate && !disableAnimate && animates) {
      const animatesExcludePosition = getAnimatesExcludePosition(animates);
      this.animations = animateShapes(
        animatesExcludePosition, // animates
        renderExt.mergedStyles, // targetStylesMap
        this.shapeMap, // shapeMap
        group,
        firstRendering ? 'buildIn' : 'update',
        this.changedStates,
        this.animateFrameListener,
        (canceled) => onfinish(model.id, canceled),
      );
    }
  }

  /**
   * Update the node's position,
   * do not update other styles which leads to better performance than updating position by updateData.
   */
  public updatePosition(
    displayModel: NodeDisplayModel | ComboDisplayModel,
    diffData?: {
      previous: NodeModelData | ComboModelData;
      current: NodeModelData | ComboModelData;
    },
    animate?: boolean,
    onfinish: Function = () => {},
  ) {
    const { group, labelGroup, graph } = this;
    const {
      fx,
      fy,
      fz,
      x,
      y,
      z = 0,
      animates,
      disableAnimate,
    } = displayModel.data;
    const position = {
      x: fx === undefined ? x : (fx as number),
      y: fy === undefined ? y : (fy as number),
      z: fz === undefined ? z : (fz as number),
    };
    if (
      isNaN(position.x as number) ||
      isNaN(position.y as number) ||
      isNaN(position.z as number)
    )
      return;
    if (animate && !disableAnimate && animates?.update) {
      const groupAnimates = animates.update.filter(
        ({ shapeId, fields = [] }) =>
          (!shapeId || shapeId === 'group') &&
          (fields.includes('x') || fields.includes('y')),
      );
      if (groupAnimates.length) {
        const animations = animateShapes(
          { update: groupAnimates },
          { group: position } as any, // targetStylesMap
          this.shapeMap, // shapeMap
          group,
          'update',
          [],
          this.animateFrameListener,
          (canceled) => onfinish(displayModel.id, canceled),
        );
        this.groupAnimations = animations;
        return;
      }
    }
    group.style.x = position.x;
    group.style.y = position.y;
    group.style.z = position.z;
    const viewportPosition = graph.getViewportByCanvas({ x, y, z });
    labelGroup.style.x = viewportPosition.x;
    labelGroup.style.y = viewportPosition.y;
    labelGroup.style.z = viewportPosition.z;
    onfinish(displayModel.id, !animate);
  }

  public clone(
    containerGroup: Group,
    shapeIds?: string[],
    disableAnimate?: boolean,
  ) {
    if (shapeIds?.length) {
      const group = new Group();
      shapeIds.forEach((shapeId) => {
        if (!this.shapeMap[shapeId] || this.shapeMap[shapeId].destroyed) return;
        const clonedKeyShape = this.shapeMap[shapeId].cloneNode();
        // TODO: other animating attributes?
        clonedKeyShape.style.opacity =
          this.renderExt.mergedStyles[shapeId]?.opacity || 1;
        group.appendChild(clonedKeyShape);
      });
      group.setPosition(this.group.getPosition());
      containerGroup.appendChild(group);
      return group;
    }
    const clonedModel = clone(this.model);
    clonedModel.data.disableAnimate = disableAnimate;
    const clonedNode = new Node({
      model: clonedModel,
      graph: this.graph,
      renderExtensions: this.renderExtensions,
      containerGroup,
      mapper: this.mapper,
      stateMapper: this.stateMapper,
      zoom: this.zoom,
      theme: {
        styles: this.themeStyles,
        lodStrategy: this.lodStrategy,
      },
    });
    Object.keys(this.shapeMap).forEach((shapeId) => {
      if (!this.shapeMap[shapeId].isVisible())
        clonedNode.shapeMap[shapeId].hide();
    });
    return clonedNode;
  }

  public getAnchorPoint(point: Point, anchorIdx?: number) {
    const { anchorPoints = [] } = this.displayModel.data as
      | NodeModelData
      | ComboModelData;

    return this.getIntersectPoint(
      point,
      this.getPosition(),
      anchorPoints,
      anchorIdx,
    );
  }

  public getIntersectPoint(
    point: Point,
    innerPoint: Point,
    anchorPoints: number[][],
    anchorIdx?: number,
  ) {
    const { keyShape } = this.shapeMap;
    const shapeType = keyShape.nodeName;
    const { x, y, z } = innerPoint;

    const keyShapeRenderBBox = keyShape.getRenderBounds();
    const keyShapeWidth = keyShapeRenderBBox.max[0] - keyShapeRenderBBox.min[0];
    const keyShapeHeight =
      keyShapeRenderBBox.max[1] - keyShapeRenderBBox.min[1];
    const anchorPositions = anchorPoints.map((pointRatio) => {
      const [xRatio, yRatio] = pointRatio;
      return {
        x: keyShapeWidth * xRatio + keyShapeRenderBBox.min[0],
        y: keyShapeHeight * yRatio + keyShapeRenderBBox.min[1],
      };
    });

    if (anchorIdx !== undefined && anchorPositions[anchorIdx]) {
      return anchorPositions[anchorIdx];
    }

    let intersectPoint: Point | null;
    switch (shapeType) {
      case 'circle':
        intersectPoint = getCircleIntersectByPoint(
          {
            x,
            y,
            r: keyShape.attributes.r,
          },
          point,
        );
        break;
      case 'ellipse':
        intersectPoint = getEllipseIntersectByPoint(
          {
            x,
            y,
            rx: keyShape.attributes.rx,
            ry: keyShape.attributes.ry,
          },
          point,
        );
        break;
      case 'mesh':
        intersectPoint = innerPoint;
        break;
      default: {
        intersectPoint = getRectIntersectByPoint(
          {
            x: keyShapeRenderBBox.min[0],
            y: keyShapeRenderBBox.min[1],
            width: keyShapeWidth,
            height: keyShapeHeight,
          },
          point,
        );
      }
    }

    let linkPoint = intersectPoint;

    // If the node has anchorPoints in the data, find the nearest anchor point.
    if (anchorPoints.length) {
      if (!linkPoint) {
        // If the linkPoint is failed to calculate.
        linkPoint = point;
      }
      linkPoint = getNearestPoint(anchorPositions, linkPoint).nearestPoint;
    }
    if (!linkPoint) {
      // If the calculations above are all failed, return the data's position
      return { x, y, z };
    }
    if (!isNaN(z)) linkPoint.z = z;
    return linkPoint;
  }

  public getPosition(): Point {
    const initiated =
      this.shapeMap.keyShape && this.group.attributes.x !== undefined;
    if (initiated && this.renderExt.dimensions !== 3) {
      const { center } = this.shapeMap.keyShape.getRenderBounds();
      return { x: center[0], y: center[1], z: center[2] };
    }
    const { x = 0, y = 0, z = 0, fx, fy, fz } = this.model.data;
    return {
      x: (fx === undefined ? x : fx) as number,
      y: (fy === undefined ? y : fy) as number,
      z: (fz === undefined ? z : fz) as number,
    };
  }
}
