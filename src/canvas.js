/**
 * Whiteboard Canvas Module - Interactive diagramming & shape drawing
 */

export class WhiteboardCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.currentTool = 'rect';
    this.strokeColor = '#38bdf8';
    this.fillColor = '#1e293b';
    this.lineWidth = 3;
    
    this.shapes = [];
    this.history = [];
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.currentShape = null;

    this.initCanvasSize();
    this.bindEvents();
    this.loadFromStorage();
  }

  initCanvasSize() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth || 1200;
    this.canvas.height = parent.clientHeight || 800;
    window.addEventListener('resize', () => {
      const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.width = parent.clientWidth || 1200;
      this.canvas.height = parent.clientHeight || 800;
      this.render();
    });
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => {
      if (this.isDrawing) this.onMouseUp();
    });
  }

  getCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onMouseDown(e) {
    const { x, y } = this.getCoords(e);
    this.isDrawing = true;
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'freehand') {
      this.currentShape = {
        type: 'freehand',
        points: [{ x, y }],
        stroke: this.strokeColor,
        width: this.lineWidth
      };
    } else if (this.currentTool === 'text') {
      const text = prompt('Enter text for diagram node:', 'Process Node');
      if (text) {
        this.saveState();
        this.shapes.push({
          type: 'text',
          x,
          y,
          text,
          color: this.strokeColor
        });
        this.render();
        this.saveToStorage();
      }
      this.isDrawing = false;
    }
  }

  onMouseMove(e) {
    if (!this.isDrawing) return;
    const { x, y } = this.getCoords(e);

    if (this.currentTool === 'freehand') {
      this.currentShape.points.push({ x, y });
      this.render();
      this.drawShape(this.currentShape);
    } else {
      this.render();
      const previewShape = {
        type: this.currentTool,
        x1: this.startX,
        y1: this.startY,
        x2: x,
        y2: y,
        stroke: this.strokeColor,
        fill: this.fillColor,
        width: this.lineWidth
      };
      this.drawShape(previewShape);
    }
  }

  onMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'freehand') {
      if (this.currentShape && this.currentShape.points.length > 1) {
        this.saveState();
        this.shapes.push(this.currentShape);
      }
    } else if (e) {
      const { x, y } = this.getCoords(e);
      if (Math.abs(x - this.startX) > 4 || Math.abs(y - this.startY) > 4) {
        this.saveState();
        this.shapes.push({
          type: this.currentTool,
          x1: this.startX,
          y1: this.startY,
          x2: x,
          y2: y,
          stroke: this.strokeColor,
          fill: this.fillColor,
          width: this.lineWidth
        });
      }
    }

    this.render();
    this.saveToStorage();
  }

  drawShape(s) {
    this.ctx.save();
    this.ctx.strokeStyle = s.stroke || this.strokeColor;
    this.ctx.fillStyle = s.fill || this.fillColor;
    this.ctx.lineWidth = s.width || this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    switch (s.type) {
      case 'rect': {
        const x = Math.min(s.x1, s.x2);
        const y = Math.min(s.y1, s.y2);
        const w = Math.abs(s.x2 - s.x1);
        const h = Math.abs(s.y2 - s.y1);
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, 8);
        this.ctx.fill();
        this.ctx.stroke();
        break;
      }
      case 'circle': {
        const rx = Math.abs(s.x2 - s.x1) / 2;
        const ry = Math.abs(s.y2 - s.y1) / 2;
        const cx = Math.min(s.x1, s.x2) + rx;
        const cy = Math.min(s.y1, s.y2) + ry;
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        break;
      }
      case 'diamond': {
        const cx = (s.x1 + s.x2) / 2;
        const cy = (s.y1 + s.y2) / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, s.y1);
        this.ctx.lineTo(s.x2, cy);
        this.ctx.lineTo(cx, s.y2);
        this.ctx.lineTo(s.x1, cy);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        break;
      }
      case 'line': {
        this.ctx.beginPath();
        this.ctx.moveTo(s.x1, s.y1);
        this.ctx.lineTo(s.x2, s.y2);
        this.ctx.stroke();
        break;
      }
      case 'arrow': {
        this.ctx.beginPath();
        this.ctx.moveTo(s.x1, s.y1);
        this.ctx.lineTo(s.x2, s.y2);
        this.ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        const headLen = 14;
        this.ctx.beginPath();
        this.ctx.moveTo(s.x2, s.y2);
        this.ctx.lineTo(s.x2 - headLen * Math.cos(angle - Math.PI / 6), s.y2 - headLen * Math.sin(angle - Math.PI / 6));
        this.ctx.moveTo(s.x2, s.y2);
        this.ctx.lineTo(s.x2 - headLen * Math.cos(angle + Math.PI / 6), s.y2 - headLen * Math.sin(angle + Math.PI / 6));
        this.ctx.stroke();
        break;
      }
      case 'freehand': {
        if (!s.points || s.points.length < 2) break;
        this.ctx.beginPath();
        this.ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          this.ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        this.ctx.stroke();
        break;
      }
      case 'text': {
        this.ctx.fillStyle = s.color || this.strokeColor;
        this.ctx.font = '14px Inter, sans-serif';
        this.ctx.fillText(s.text, s.x, s.y);
        break;
      }
    }
    this.ctx.restore();
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const shape of this.shapes) {
      this.drawShape(shape);
    }
  }

  saveState() {
    this.history.push(JSON.stringify(this.shapes));
    if (this.history.length > 30) this.history.shift();
  }

  undo() {
    if (this.history.length > 0) {
      const prev = this.history.pop();
      this.shapes = JSON.parse(prev);
      this.render();
      this.saveToStorage();
    }
  }

  clear() {
    if (confirm('Clear the whiteboard canvas?')) {
      this.saveState();
      this.shapes = [];
      this.render();
      this.saveToStorage();
    }
  }

  exportPNG() {
    const link = document.createElement('a');
    link.download = `diagram-${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  saveToStorage() {
    try {
      localStorage.setItem('npp_canvas_shapes', JSON.stringify(this.shapes));
    } catch (e) {
      console.warn('Canvas storage failed', e);
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('npp_canvas_shapes');
      if (saved) {
        this.shapes = JSON.parse(saved);
        this.render();
      }
    } catch (e) {
      console.warn('Could not load canvas data', e);
    }
  }
}
