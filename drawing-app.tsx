"use client"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import {
  Undo2,
  Redo2,
  Eraser,
  Save,
  Upload,
  Download,
  Pencil,
  LineChartIcon as LineIcon,
  Square,
  Circle,
  Triangle,
  ChevronDown,
  Info,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export default function DrawingApp() {
  const canvasRef = useRef(null)
  const [pathData, setPathData] = useState([])
  const [history, setHistory] = useState([])
  const [future, setFuture] = useState([])
  const [drawing, setDrawing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [fileName, setFileName] = useState("drawing")
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [tool, setTool] = useState("pen") // "pen", "eraser", "line", "rectangle", "circle", "triangle"
  const [debugInfo, setDebugInfo] = useState({ x: 0, y: 0, tool: "pen", action: "none" })
  const [gcodeSettings, setGcodeSettings] = useState({
    feedRate: 1000,
    penUpCommand: "M5",
    penDownCommand: "M3",
    travelSpeed: 3000,
  })

  // For shape drawing
  const [shapeStart, setShapeStart] = useState({ x: 0, y: 0 })
  const [trianglePoints, setTrianglePoints] = useState([])
  const tempCanvasRef = useRef(null)

  // Initialize canvas and handle resizing
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Get the current drawing
      const ctx = canvas.getContext("2d")
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Set canvas dimensions based on its container
      const container = canvas.parentElement
      const containerWidth = container.clientWidth
      const aspectRatio = canvas.height / canvas.width

      // Update canvas size while maintaining aspect ratio
      const newWidth = containerWidth
      const newHeight = containerWidth * aspectRatio

      // Only resize if dimensions actually changed
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth
        canvas.height = newHeight

        // Restore the drawing
        ctx.putImageData(imageData, 0, 0)
      }
    }

    // Initial sizing
    handleResize()

    // Add resize listener
    window.addEventListener("resize", handleResize)

    // Create temp canvas for shape preview if it doesn't exist
    if (!tempCanvasRef.current) {
      const canvas = canvasRef.current
      if (canvas) {
        const tempCanvasElem = document.createElement("canvas")
        tempCanvasElem.width = canvas.width
        tempCanvasElem.height = canvas.height
        tempCanvasRef.current = tempCanvasElem
      }
    }

    // Cleanup
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const getPointerPos = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 }

    const rect = canvasRef.current.getBoundingClientRect()
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handleStart = (e) => {
    e.preventDefault()

    if (!canvasRef.current) return

    const pos = getPointerPos(e)
    setDebugInfo({ ...debugInfo, x: Math.round(pos.x), y: Math.round(pos.y), action: "start" })

    // Save current state for undo
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    if (tool === "triangle") {
      // For triangle, we collect points on each click
      if (trianglePoints.length < 2) {
        // Add point to triangle points
        setTrianglePoints((prev) => [...prev, pos])

        // Draw point marker
        ctx.fillStyle = "#000"
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2)
        ctx.fill()

        // If it's the first point, save state for undo
        if (trianglePoints.length === 0) {
          setHistory((prev) => [...prev, imageData])
          setFuture([])
        }

        return
      } else {
        // This is the third point, complete the triangle
        const points = [...trianglePoints, pos]
        drawTriangle(ctx, points[0], points[1], points[2])

        // Add to path data
        setPathData((prev) => [
          ...prev,
          [
            [points[0].x, points[0].y],
            [points[1].x, points[1].y],
            [points[2].x, points[2].y],
            [points[0].x, points[0].y], // Close the path
          ],
        ])

        // Reset triangle points
        setTrianglePoints([])
        return
      }
    }

    // For other tools
    setDrawing(true)
    setShapeStart(pos)

    if (tool === "pen" || tool === "eraser") {
      // Start new path for freehand drawing
      setPathData((prev) => [...prev, [[pos.x, pos.y]]])

      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)

      if (tool === "pen") {
        ctx.lineWidth = strokeWidth
        ctx.lineCap = "round"
        ctx.strokeStyle = "#000000"
      } else if (tool === "eraser") {
        ctx.lineWidth = strokeWidth * 2
        ctx.lineCap = "round"
        ctx.strokeStyle = "#FFFFFF"
      }
    } else {
      // For shape tools, save the current canvas to the temp canvas
      if (tempCanvasRef.current) {
        const tempCtx = tempCanvasRef.current.getContext("2d")
        tempCtx.clearRect(0, 0, tempCanvasRef.current.width, tempCanvasRef.current.height)
        tempCtx.drawImage(canvas, 0, 0)
      }
    }

    // Save state for undo (except triangle which is handled separately)
    if (tool !== "triangle") {
      setHistory((prev) => [...prev, imageData])
      setFuture([])
    }
  }

  const handleMove = (e) => {
    if (!canvasRef.current) return

    const pos = getPointerPos(e)
    setDebugInfo({ ...debugInfo, x: Math.round(pos.x), y: Math.round(pos.y), action: "move" })

    if (tool === "triangle" && trianglePoints.length > 0) {
      // Preview the triangle as we move
      e.preventDefault()

      if (tempCanvasRef.current) {
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")

        // Copy current canvas to temp canvas
        const tempCtx = tempCanvasRef.current.getContext("2d")
        tempCtx.clearRect(0, 0, tempCanvasRef.current.width, tempCanvasRef.current.height)
        tempCtx.drawImage(canvas, 0, 0)

        // Clear canvas and redraw from temp
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(tempCanvasRef.current, 0, 0)

        // Draw preview triangle
        if (trianglePoints.length === 1) {
          // Draw line from first point to current position
          ctx.beginPath()
          ctx.moveTo(trianglePoints[0].x, trianglePoints[0].y)
          ctx.lineTo(pos.x, pos.y)
          ctx.strokeStyle = "#000000"
          ctx.lineWidth = strokeWidth
          ctx.stroke()
        } else if (trianglePoints.length === 2) {
          // Draw preview of complete triangle
          ctx.beginPath()
          ctx.moveTo(trianglePoints[0].x, trianglePoints[0].y)
          ctx.lineTo(trianglePoints[1].x, trianglePoints[1].y)
          ctx.lineTo(pos.x, pos.y)
          ctx.lineTo(trianglePoints[0].x, trianglePoints[0].y)
          ctx.strokeStyle = "#000000"
          ctx.lineWidth = strokeWidth
          ctx.stroke()
        }
      }

      return
    }

    if (!drawing) return
    e.preventDefault()

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    if (tool === "pen" || tool === "eraser") {
      // Freehand drawing
      if (tool === "pen") {
        ctx.lineWidth = strokeWidth
        ctx.strokeStyle = "#000000"
      } else if (tool === "eraser") {
        ctx.lineWidth = strokeWidth * 2
        ctx.strokeStyle = "#FFFFFF"
      }

      ctx.lineCap = "round"
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)

      setPathData((prev) => {
        const newData = [...prev]
        if (newData.length > 0) {
          newData[newData.length - 1].push([pos.x, pos.y])
        }
        return newData
      })
    } else if (tempCanvasRef.current) {
      // Shape preview
      const tempCtx = tempCanvasRef.current.getContext("2d")

      // Clear canvas and redraw from temp
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(tempCanvasRef.current, 0, 0)

      // Draw shape preview
      ctx.beginPath()
      ctx.strokeStyle = "#000000"
      ctx.lineWidth = strokeWidth

      if (tool === "line") {
        ctx.moveTo(shapeStart.x, shapeStart.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      } else if (tool === "rectangle") {
        const width = pos.x - shapeStart.x
        const height = pos.y - shapeStart.y
        ctx.rect(shapeStart.x, shapeStart.y, width, height)
        ctx.stroke()
      } else if (tool === "circle") {
        const radius = Math.sqrt(Math.pow(pos.x - shapeStart.x, 2) + Math.pow(pos.y - shapeStart.y, 2))
        ctx.arc(shapeStart.x, shapeStart.y, radius, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  const handleEnd = (e) => {
    if (!canvasRef.current) return

    const pos = e ? getPointerPos(e) : { x: 0, y: 0 }
    setDebugInfo({ ...debugInfo, x: Math.round(pos.x), y: Math.round(pos.y), action: "end" })

    if (!drawing && tool !== "triangle") return

    if (tool === "triangle") {
      // Triangle is handled in handleStart when the third point is placed
      return
    }

    setDrawing(false)
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    if (tool !== "pen" && tool !== "eraser") {
      // Finalize shape
      if (tool === "line") {
        // Add line to path data
        setPathData((prev) => [
          ...prev,
          [
            [shapeStart.x, shapeStart.y],
            [pos.x, pos.y],
          ],
        ])

        // Draw final line
        ctx.beginPath()
        ctx.moveTo(shapeStart.x, shapeStart.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = "#000000"
        ctx.lineWidth = strokeWidth
        ctx.stroke()
      } else if (tool === "rectangle") {
        const width = pos.x - shapeStart.x
        const height = pos.y - shapeStart.y

        // Add rectangle to path data
        setPathData((prev) => [
          ...prev,
          [
            [shapeStart.x, shapeStart.y],
            [shapeStart.x + width, shapeStart.y],
            [shapeStart.x + width, shapeStart.y + height],
            [shapeStart.x, shapeStart.y + height],
            [shapeStart.x, shapeStart.y], // Close the path
          ],
        ])

        // Draw final rectangle
        ctx.beginPath()
        ctx.rect(shapeStart.x, shapeStart.y, width, height)
        ctx.strokeStyle = "#000000"
        ctx.lineWidth = strokeWidth
        ctx.stroke()
      } else if (tool === "circle") {
        const radius = Math.sqrt(Math.pow(pos.x - shapeStart.x, 2) + Math.pow(pos.y - shapeStart.y, 2))

        // Add circle to path data (approximated as points)
        const circlePoints = []
        for (let i = 0; i <= 360; i += 10) {
          const angle = (i * Math.PI) / 180
          const x = shapeStart.x + radius * Math.cos(angle)
          const y = shapeStart.y + radius * Math.sin(angle)
          circlePoints.push([x, y])
        }
        setPathData((prev) => [...prev, circlePoints])

        // Draw final circle
        ctx.beginPath()
        ctx.arc(shapeStart.x, shapeStart.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = "#000000"
        ctx.lineWidth = strokeWidth
        ctx.stroke()
      }
    }

    ctx.beginPath()
  }

  const drawTriangle = (ctx, p1, p2, p3) => {
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.lineTo(p3.x, p3.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = strokeWidth
    ctx.stroke()
  }

  const undo = () => {
    if (history.length === 0) return

    // Cancel triangle drawing if in progress
    if (tool === "triangle" && trianglePoints.length > 0) {
      setTrianglePoints([])
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")

    // Save current state to future for redo
    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setFuture((prev) => [currentState, ...prev])

    // Get previous state
    const previousState = history[history.length - 1]
    setHistory((prev) => prev.slice(0, -1))

    // Apply previous state
    ctx.putImageData(previousState, 0, 0)
  }

  const redo = () => {
    if (future.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")

    // Save current state to history
    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((prev) => [...prev, currentState])

    // Get next state
    const nextState = future[0]
    setFuture((prev) => prev.slice(1))

    // Apply next state
    ctx.putImageData(nextState, 0, 0)
  }

  const exportGCode = () => {
    if (!pathData.length) {
      alert("There's nothing to export.")
      return
    }

    try {
      // Get canvas dimensions for scaling
      const canvas = canvasRef.current
      const canvasWidth = canvas.width
      const canvasHeight = canvas.height

      // Start with G-code header
      let gcode = `; Generated G-code for pen plotter
; Filename: ${fileName}
; Date: ${new Date().toISOString()}
; Canvas dimensions: ${canvasWidth}x${canvasHeight}
G21 ; Set units to mm
G90 ; Absolute positioning
G92 X0 Y0 ; Set current position as origin
`

      // Process each path
      pathData.forEach((stroke, index) => {
        if (stroke.length > 0) {
          gcode += `; Path ${index + 1}\n`

          // Move to start position with pen up
          const [startX, startY] = stroke[0]
          gcode += `G0 F${gcodeSettings.travelSpeed} X${startX.toFixed(2)} Y${startY.toFixed(2)} ; Move to start\n`

          // Pen down
          gcode += `${gcodeSettings.penDownCommand} ; Pen down\n`

          // Draw the path
          gcode += `G1 F${gcodeSettings.feedRate} ; Set drawing speed\n`
          stroke.slice(1).forEach(([x, y]) => {
            gcode += `G1 X${x.toFixed(2)} Y${y.toFixed(2)}\n`
          })

          // Pen up
          gcode += `${gcodeSettings.penUpCommand} ; Pen up\n\n`
        }
      })

      // Add footer
      gcode += `; End of file
G0 X0 Y0 ; Return to origin
M2 ; End program
`

      // Create and download the file
      const blob = new Blob([gcode], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${fileName || "drawing"}.gcode`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setDialogOpen(false)
    } catch (err) {
      console.error("Error exporting G-code:", err)
      alert("An error occurred while exporting G-code.")
    }
  }

  const exportSVG = () => {
    if (!pathData.length) {
      alert("There's nothing to export.")
      return
    }

    try {
      const canvas = canvasRef.current
      let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">\n`
      pathData.forEach((stroke) => {
        if (stroke.length > 0) {
          const points = stroke.map(([x, y]) => `${x},${y}`).join(" ")
          svgContent += `<polyline points="${points}" stroke="#000000" fill="none" strokeWidth="${strokeWidth}" strokeLinecap="round" />\n`
        }
      })
      svgContent += `</svg>`

      const encoded = encodeURIComponent(svgContent)
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encoded}`
      const link = document.createElement("a")
      link.href = dataUrl
      link.download = `${fileName || "drawing"}.svg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setDialogOpen(false)
    } catch (err) {
      console.error("Error exporting SVG:", err)
      alert("An error occurred while exporting the SVG.")
    }
  }

  const clearCanvas = () => {
    // Cancel triangle drawing if in progress
    if (tool === "triangle" && trianglePoints.length > 0) {
      setTrianglePoints([])
    }

    const canvas = canvasRef.current
    if (!canvas) return

    // Save current state for undo
    const ctx = canvas.getContext("2d")
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((prev) => [...prev, imageData])
    setFuture([])

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setPathData([])
  }

  const saveDrawing = () => {
    try {
      const canvas = canvasRef.current
      if (!canvas) return

      const dataURL = canvas.toDataURL("image/png")
      localStorage.setItem("savedDrawing", dataURL)
      localStorage.setItem("savedPathData", JSON.stringify(pathData))
      alert("Drawing saved successfully!")
    } catch (err) {
      console.error("Error saving drawing:", err)
      alert("Failed to save drawing. Your browser might have storage restrictions.")
    }
  }

  const loadDrawing = () => {
    try {
      const savedDrawing = localStorage.getItem("savedDrawing")
      const savedPathData = localStorage.getItem("savedPathData")

      if (!savedDrawing || !savedPathData) {
        alert("No saved drawing found.")
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return

      // Save current state for undo
      const ctx = canvas.getContext("2d")
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setHistory((prev) => [...prev, imageData])
      setFuture([])

      // Load saved drawing
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      img.src = savedDrawing

      // Load saved path data
      setPathData(JSON.parse(savedPathData))
    } catch (err) {
      console.error("Error loading drawing:", err)
      alert("Failed to load drawing. The saved data might be corrupted.")
    }
  }

  // Update debug info when tool changes
  useEffect(() => {
    setDebugInfo((prev) => {
      if (prev.tool !== tool) {
        return { ...prev, tool }
      }
      return prev
    })
  }, [tool])

  return (
    <div className="flex flex-col items-center p-4 w-full">
      <div className="w-full max-w-3xl mb-4">
        <Tabs defaultValue="draw" className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="draw">Draw</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={undo} disabled={history.length === 0} title="Undo">
                  <Undo2 className="h-4 w-4" />
                  <span className="sr-only">Undo</span>
                </Button>
                <Button variant="outline" size="icon" onClick={redo} disabled={future.length === 0} title="Redo">
                  <Redo2 className="h-4 w-4" />
                  <span className="sr-only">Redo</span>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Toggle
                  pressed={tool === "pen"}
                  onPressedChange={() => setTool("pen")}
                  title="Pen Tool"
                  aria-label="Toggle pen tool"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  <span>Pen</span>
                </Toggle>
                <Toggle
                  pressed={tool === "eraser"}
                  onPressedChange={() => setTool("eraser")}
                  title="Eraser Tool"
                  aria-label="Toggle eraser tool"
                >
                  <Eraser className="h-4 w-4 mr-1" />
                  <span>Eraser</span>
                </Toggle>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-1">
                      {tool === "line" && <LineIcon className="h-4 w-4 mr-1" />}
                      {tool === "rectangle" && <Square className="h-4 w-4 mr-1" />}
                      {tool === "circle" && <Circle className="h-4 w-4 mr-1" />}
                      {tool === "triangle" && <Triangle className="h-4 w-4 mr-1" />}
                      <span>
                        {tool === "line"
                          ? "Line"
                          : tool === "rectangle"
                            ? "Rectangle"
                            : tool === "circle"
                              ? "Circle"
                              : tool === "triangle"
                                ? "Triangle"
                                : "Shapes"}
                      </span>
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setTool("line")}>
                      <LineIcon className="h-4 w-4 mr-2" />
                      <span>Line</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTool("rectangle")}>
                      <Square className="h-4 w-4 mr-2" />
                      <span>Rectangle</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTool("circle")}>
                      <Circle className="h-4 w-4 mr-2" />
                      <span>Circle</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTool("triangle")}>
                      <Triangle className="h-4 w-4 mr-2" />
                      <span>Triangle</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={saveDrawing} title="Save Drawing">
                  <Save className="h-4 w-4 mr-1" />
                  <span>Save</span>
                </Button>
                <Button variant="outline" size="sm" onClick={loadDrawing} title="Load Drawing">
                  <Upload className="h-4 w-4 mr-1" />
                  <span>Load</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="stroke-width" className="text-sm font-medium min-w-[50px]">
                Width:
              </label>
              <Slider
                id="stroke-width"
                min={1}
                max={20}
                step={1}
                value={[strokeWidth]}
                onValueChange={(value) => setStrokeWidth(value[0])}
                className="w-full max-w-xs"
              />
              <span className="text-sm min-w-[30px] text-center">{strokeWidth}px</span>
            </div>

            {tool === "triangle" && trianglePoints.length > 0 && (
              <div className="text-sm text-blue-600">
                {trianglePoints.length === 1
                  ? "Click to place the second point of the triangle"
                  : "Click to place the third point and complete the triangle"}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">G-code Export Settings</h3>
                <div className="space-y-3 bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center gap-2">
                    <label htmlFor="feed-rate" className="text-sm min-w-[120px]">
                      Feed Rate (mm/min):
                    </label>
                    <Input
                      id="feed-rate"
                      type="number"
                      value={gcodeSettings.feedRate}
                      onChange={(e) =>
                        setGcodeSettings({ ...gcodeSettings, feedRate: Number.parseInt(e.target.value) || 1000 })
                      }
                      className="max-w-[100px]"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                            <Info className="h-4 w-4" />
                            <span className="sr-only">Feed rate info</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Speed at which the pen moves while drawing</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="travel-speed" className="text-sm min-w-[120px]">
                      Travel Speed (mm/min):
                    </label>
                    <Input
                      id="travel-speed"
                      type="number"
                      value={gcodeSettings.travelSpeed}
                      onChange={(e) =>
                        setGcodeSettings({ ...gcodeSettings, travelSpeed: Number.parseInt(e.target.value) || 3000 })
                      }
                      className="max-w-[100px]"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                            <Info className="h-4 w-4" />
                            <span className="sr-only">Travel speed info</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Speed at which the pen moves when not drawing</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="pen-down" className="text-sm min-w-[120px]">
                      Pen Down Command:
                    </label>
                    <Input
                      id="pen-down"
                      value={gcodeSettings.penDownCommand}
                      onChange={(e) => setGcodeSettings({ ...gcodeSettings, penDownCommand: e.target.value })}
                      className="max-w-[100px]"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                            <Info className="h-4 w-4" />
                            <span className="sr-only">Pen down command info</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">G-code command to lower the pen (e.g., M3)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="pen-up" className="text-sm min-w-[120px]">
                      Pen Up Command:
                    </label>
                    <Input
                      id="pen-up"
                      value={gcodeSettings.penUpCommand}
                      onChange={(e) => setGcodeSettings({ ...gcodeSettings, penUpCommand: e.target.value })}
                      className="max-w-[100px]"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                            <Info className="h-4 w-4" />
                            <span className="sr-only">Pen up command info</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">G-code command to raise the pen (e.g., M5)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Debug Information</h3>
                <div className="text-xs bg-gray-100 p-2 rounded">
                  <p>Tool: {debugInfo.tool}</p>
                  <p>
                    Position: x={debugInfo.x}, y={debugInfo.y}
                  </p>
                  <p>Action: {debugInfo.action}</p>
                  <p>History: {history.length} states</p>
                  <p>Future: {future.length} states</p>
                  <p>Path Data: {pathData.length} paths</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="w-full max-w-3xl">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-auto border border-gray-300 rounded-md shadow-sm touch-none bg-white"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          aria-label="Drawing canvas"
        />
      </div>

      <div className="flex gap-3 mt-4 flex-wrap justify-center w-full max-w-3xl">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="default" className="px-6 py-2 text-base">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DialogTrigger>
          <DialogContent className="flex flex-col gap-4 w-[90vw] max-w-md">
            <DialogTitle>Export Drawing</DialogTitle>
            <Input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Enter file name"
              className="text-base py-2"
            />
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button type="button" onClick={exportSVG} className="flex-1 py-2 text-base">
                Download SVG
              </Button>
              <Button type="button" onClick={exportGCode} className="flex-1 py-2 text-base">
                Download G-code
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button type="button" onClick={clearCanvas} variant="destructive" className="px-6 py-2 text-base">
          Clear Canvas
        </Button>
      </div>
    </div>
  )
}

