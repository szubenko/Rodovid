import type { Projection } from './projection'
import type { TextMeasure } from './text-block'
import { layoutTree } from './tree-layout'

export type { TreeNode as HorizontalNode, TreeLayout as HorizontalLayout } from './tree-layout'

export function layoutHorizontal(projection: Projection, labels: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string>, measure: TextMeasure) {
  return layoutTree(projection, labels, dates, measure, 'horizontal')
}
