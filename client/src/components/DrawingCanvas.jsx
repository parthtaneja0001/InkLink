import React, { useRef, useEffect, useState, useCallback } from 'react';
import socket from '../socket';

/**
 * DrawingCanvas component handles all canvas rendering, user input, 
 * and real-time synchronization via sockets.
 */
const DrawingCanvas = ({ roomId, isDrawer }) => {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Default drawing state
    const [drawingProps, setDrawingProps] = useState({
        color: '#000000',
        size: 5,
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        // Make canvas responsive
        canvas.width = window.innerWidth * 0.9;
        canvas.height = window.innerHeight * 0.6;
        
        const context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.strokeStyle = drawingProps.color;
        context.lineWidth = drawingProps.size;
        contextRef.current = context;

        // Initialize canvas background (important for saving transparent images)
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Handle window resize
        const handleResize = () => {
            // Re-sync logic would be required here to redraw strokes, 
            // but we keep it simple for now.
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Function to draw a line segment
    const drawLine = useCallback((startX, startY, endX, endY, color, size) => {
        const ctx = contextRef.current;
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.closePath();
    }, []);

    // --- Socket Receiver Logic ---
    useEffect(() => {
        if (!contextRef.current) return;

        // Listener for incoming stroke data from other players
        socket.on('receive_drawing_data', (strokeData) => {
            const { startX, startY, endX, endY, color, size } = strokeData;
            drawLine(startX, startY, endX, endY, color, size);
        });

        // Listener for canvas sync on join (not fully implemented, but shown)
        socket.on('canvas_sync', (strokes) => {
            // Implement logic to redraw all strokes from the server
            console.log('Syncing canvas with existing strokes:', strokes.length);
        });

        return () => {
            socket.off('receive_drawing_data');
            socket.off('canvas_sync');
        };
    }, [drawLine]);

    // --- Local Drawing & Emission Logic ---
    const startDrawing = ({ nativeEvent }) => {
        if (!isDrawer) return; // Only the designated drawer can draw
        const { offsetX, offsetY } = nativeEvent;
        contextRef.current.beginPath();
        contextRef.current.moveTo(offsetX, offsetY);
        setIsDrawing(true);
        contextRef.current.strokeStyle = drawingProps.color;
        contextRef.current.lineWidth = drawingProps.size;
    };

    const draw = ({ nativeEvent }) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = nativeEvent;
        const startPoint = contextRef.current.getImageData(0, 0, 1, 1); // Mock start point to send

        // Draw locally
        contextRef.current.lineTo(offsetX, offsetY);
        contextRef.current.stroke();

        // Prepare and emit stroke data to the server
        const strokeData = {
            startX: contextRef.current.currentX || offsetX, // Use previous X for continuity
            startY: contextRef.current.currentY || offsetY,
            endX: offsetX,
            endY: offsetY,
            color: drawingProps.color,
            size: drawingProps.size,
            brushType: 'basic_pen', // For future texture features
        };
        
        // Update current position for next segment
        contextRef.current.currentX = offsetX;
        contextRef.current.currentY = offsetY;

        // Emit drawing data
        socket.emit('drawing_data', roomId, strokeData);
    };

    const stopDrawing = () => {
        if (!isDrawer) return;
        contextRef.current.closePath();
        setIsDrawing(false);
        // Clear stored current X/Y after finishing a stroke
        contextRef.current.currentX = null;
        contextRef.current.currentY = null;
    };
    
    // --- Tool Handlers ---
    const changeColor = (newColor) => {
        setDrawingProps(prev => ({ ...prev, color: newColor }));
    };

    const changeSize = (newSize) => {
        setDrawingProps(prev => ({ ...prev, size: newSize }));
    };

    const clearCanvas = () => {
        if (!isDrawer) return;
        contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        contextRef.current.fillStyle = '#FFFFFF'; // Reset background
        contextRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        // Also emit a clear_canvas event via socket
        socket.emit('clear_canvas', roomId);
    };


    return (
        <div className="flex flex-col items-center bg-gray-100 p-4 rounded-xl shadow-2xl">
            <h2 className="text-xl font-bold mb-3 text-indigo-700">
                {isDrawer ? "YOUR TURN TO DRAW!" : "GUESS WHAT IS BEING DRAWN!"}
            </h2>

            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseMove={draw}
                onMouseOut={stopDrawing}
                onTouchStart={(e) => startDrawing({ nativeEvent: e.touches[0] })}
                onTouchMove={(e) => draw({ nativeEvent: e.touches[0] })}
                onTouchEnd={stopDrawing}
                className={`border-4 border-indigo-500 bg-white rounded-lg ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}
            />

            {isDrawer && (
                <div className="flex space-x-4 mt-4 p-3 bg-indigo-100 rounded-lg">
                    {/* Color Picker */}
                    <input type="color" value={drawingProps.color} onChange={(e) => changeColor(e.target.value)} className="w-10 h-10 rounded-full cursor-pointer"/>
                    
                    {/* Size Slider */}
                    <input type="range" min="1" max="20" value={drawingProps.size} onChange={(e) => changeSize(parseInt(e.target.value))} className="w-32 range range-primary" />
                    <span className="text-indigo-800 font-medium">Size: {drawingProps.size}</span>

                    {/* Clear Button */}
                    <button 
                        onClick={clearCanvas}
                        className="px-4 py-2 bg-red-500 text-white font-semibold rounded-full hover:bg-red-600 transition duration-150 shadow-md"
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
};

export default DrawingCanvas;
