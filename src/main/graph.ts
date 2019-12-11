import * as joint from 'jointjs'
import * as utils from '../utils'
import Rect = joint.shapes.basic.Rect;
import Link = joint.dia.Link;
import Cell = joint.dia.Cell;
import Graph = joint.dia.Graph;
import Paper = joint.dia.Paper;

const CHAR_SIZE = 10

const DEFAULT_LINK_COLOR = '#748599'
const SELECTED_STROKE_COLOR = '#748599'
const NODE_TEXT_COLOR = '#fff'

const COLORS = {
  encodes: '#748599',
  declares: '#748599',
  references: '#748599',

  unit: '#115CD4',
  domain: '#115CD4',
  declaration: '#115CD4'
}

export class PlaygroundGraph {
  public nodes: {[id:string]: Rect};
  public links: Link[];
  public paper: Paper;
  public scaleX = 1;
  public scaleY = 1;
  public elements: any[];

  constructor (public selectedId: string, public level: 'domain' | 'document', public handler: (id: string, unit: any) => void) {}

  process (elements: any[]) {
    this.nodes = {}
    this.links = []
    this.elements = elements
    this.elements.forEach(element => {
      this.makeNode(element, 'domain', element)
      if (element.parentId) {
        this.makeLink(element.parentId, element.id)
      }
    })
  }

  render (div: string, cb: () => undefined) {
    setTimeout(() => {
      const graphContainer = document.getElementById(div)
      if (graphContainer != null) {
        const classes: Cell[] = []
        for (const p in this.nodes) {
          classes.push(this.nodes[p])
        }

        const cells: Cell[] = (classes).concat(this.links)
        const acc = {}
        cells.forEach(c => { acc[c.id] = true })

        const finalCells = cells.filter(c => {
          return (c.attributes.source == null) || (acc[c.attributes.source.id] && acc[c.attributes.target.id])
        })
        // const finalCells = cells;
        if (joint.layout != null) {
          joint.layout.DirectedGraph.layout(finalCells, {
            marginX: 50,
            marginY: 50,
            nodeSep: 50,
            edgeSep: 50,
            rankSep: 100,
            rankDir: 'TB'
          })
        }
        const maxX = Math.max(...finalCells.map(c => {
          return c.attributes.position
            ? (c.attributes.position.x + c.attributes.size.width)
            : 0
        }))
        const maxY = Math.max(...finalCells.map(c => {
          return c.attributes.position
            ? (c.attributes.position.y + c.attributes.size.height)
            : 0
        }))

        const graph: any = new Graph()
        const width = maxX + 100
        const height = maxY + 100

        if (graphContainer != null) {
          graphContainer.innerHTML = ''

          const minWidth = graphContainer.clientWidth
          // let minHeight = graphContainer.clientHeight;
          const minHeight = globalThis.window.innerHeight - 300

          const options = {
            el: graphContainer,
            width: (minWidth > width ? minWidth : width),
            height: (minHeight > height ? minHeight : height),
            gridSize: 1,
            interactive: false,
            model: graph
          }
          this.paper = new Paper(options)

          this.paper.on('cell:pointerdown',
            (cellView, evt, x, y) => {
              const nodeId = cellView.model.attributes.attrs.nodeId
              const unit = cellView.model.attributes.attrs.unit
              this.handler(nodeId, unit)
            }
          )

          graph.addCells(finalCells)
          let zoomx = 1
          let zoomy = 1
          if (minWidth < width) {
            zoomx = minWidth / width
          }
          if (minHeight < height) {
            zoomy = minHeight / height
          }
          const zoom = zoomy < zoomx ? zoomy : zoomx
          this.paperScale(zoom, zoom)
          this.paper.removeTools()
          if (cb) {
            cb()
          } else {

          }
          return true
        }
      }
    }, 100)
  }

  paperScale (sx, sy) {
    this.scaleX = sx
    this.scaleY = sy
    this.paper.scale(sx, sy)
    this.paper.fitToContent()
    this.centerGraphX()
  }

  centerGraphX () {
    const container = document.getElementById('graph-container')
    const containerWidth = container.clientWidth
    const contentWidth = this.paper.getContentBBox().width
    const offset = (containerWidth - contentWidth) / 2
    if (contentWidth + offset > containerWidth) {
      container.scroll(Math.abs(offset), 0)
    } else {
      this.paper.translate(offset)
      this.paper.setDimensions('100%', undefined)
    }
  }

  zoomOut () {
    this.scaleX -= 0.05
    this.scaleY -= 0.05
    this.paperScale(this.scaleX, this.scaleY)
  }

  zoomIn () {
    this.scaleX += 0.05
    this.scaleY += 0.05
    this.paperScale(this.scaleX, this.scaleY)
  }

  resetZoom () {
    this.scaleX = 1
    this.scaleY = 1
    this.paperScale(this.scaleX, this.scaleY)
  }

  private makeNode (node: {id: string, label: string}, kind: string, unit: any) {
    const label = node.label != null ? node.label : utils.label(node.id)
    if (this.nodes[node.id] == null) {
      this.nodes[node.id] = new Rect({
        attrs: {
          rect: {
            fill: COLORS[kind],
            stroke: node.id === this.selectedId ? SELECTED_STROKE_COLOR : NODE_TEXT_COLOR,
            'stroke-width': node.id === this.selectedId ? '3' : '1'
          },
          text: {
            text: label,
            fill: NODE_TEXT_COLOR
          }
        },
        position: { x: 0, y: 0 },
        size: {
          width: label.length * CHAR_SIZE,
          height: 30
        }
      })
      this.nodes[node.id].attributes.attrs.nodeId = node.id
      this.nodes[node.id].attributes.attrs.unit = unit
    }
  }

  private makeLink (sourceId: string, targetId: string) {
    if (this.nodes[sourceId] && this.nodes[targetId]) {
      this.links.push(new Link({
        source: { id: this.nodes[sourceId].id },
        target: { id: this.nodes[targetId].id },
        attrs: {
          '.marker-target': {
            d: 'M 10 0 L 0 5 L 10 10 z',
            fill: DEFAULT_LINK_COLOR,
            stroke: DEFAULT_LINK_COLOR
          },
          '.connection': { stroke: DEFAULT_LINK_COLOR }
        },
        arrowheadMarkup: '<g />'
      }))
    }
  }

  public toggleFullscreen (graphContainerId: string, editorContainerId: string) {
    const editorContainer = document.getElementById(editorContainerId)
    const editorWidth = editorContainer.style.width
    editorContainer.style.width = editorWidth === '50%' ? '0%' : '50%'

    const graphContainer = document.getElementById(graphContainerId)
    const graphWidth = graphContainer.style.width
    graphContainer.style.width = graphWidth === '50%' ? '100%' : '50%'

    const scaleMulti = graphWidth === '50%' ? 2 : 0.5
    this.paperScale(this.scaleX * scaleMulti, this.scaleY * scaleMulti)
  }
}
