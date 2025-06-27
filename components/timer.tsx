'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from './card.jsx';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Constants for better maintainability
const TIMER_CONSTANTS = {
  CANVAS: {
    WIDTH: 800,
    HEIGHT: 512,
    TEXT_WIDTH: 512,
    TEXT_HEIGHT: 128,
  },
  COLORS: {
    TIMER_BASE: 0xfcfcff,
    BUTTON_DEFAULT: 0x999999,
    BUTTON_ACTIVE: 0xd3d7d9,
    BUTTON_PRESSED: 0x999999,
    BUTTON_NORMAL: 0xd3d7d9,
    LIGHT_ACTIVE: 0xff3333,
    LIGHT_INACTIVE: 0x3c3c3c,
    DISPLAY_BOX: 0x9ea79c,
    TEXT_NORMAL: '#000',
    TEXT_FLASH: '#ff0000',
  },
  TIME_LIMITS: {
    TIMER_MAX: 99 * 3600 + 59 * 60 + 59, // 99:59:59
    STOPWATCH_HMS_MAX: 99 * 3600 + 59 * 60 + 59, // 99:59:59
    STOPWATCH_MS_MAX: 59 * 60 * 100 + 99, // 59:59.99
  },
  INTERVALS: {
    TIMER: 1000,
    STOPWATCH_HMS: 1000,
    STOPWATCH_MS: 10,
    LONG_PRESS: 200,
    FLASH: 300,
  },
  DIMENSIONS: {
    CARD_WIDTH: 4,
    CARD_HEIGHT: 6,
    CARD_THICKNESS: 1,
    BUTTON_RADIUS: 1.5,
    BUTTON_HEIGHT: 0.1,
  }
} as const;

type TimerMode = 'timer' | 'stopwatch';
type DisplayFormat = 'hms' | 'ms';

interface LogEntry {
  id: string;
  startTime: Date;
  duration: number;
  formattedDuration: string;
}

interface TimerState {
  mode: TimerMode;
  displayFormat: DisplayFormat;
  running: boolean;
  paused: boolean;
  time: number;
  timerSet: number;
  flash: boolean;
  startTime: Date | null;
}

// Utility: Create a text label mesh for buttons
const createButtonLabel = (
    text: string,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): THREE.Mesh => {
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 72;
    const labelCtx = labelCanvas.getContext('2d');
    
    if (!labelCtx) {
        throw new Error('Failed to get 2D context for label canvas');
    }
    
    labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    labelCtx.fillStyle = TIMER_CONSTANTS.COLORS.TEXT_NORMAL;
    labelCtx.font = '84px sans-serif';
    labelCtx.textAlign = 'center';
    labelCtx.textBaseline = 'middle';
    labelCtx.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2);

    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true });
    const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), labelMaterial);
    labelPlane.position.set(position.x, position.y, position.z);
    return labelPlane;
};

// Helper: Create a button mesh with proper typing
const createButtonMesh = (
    geometry: THREE.ExtrudeGeometry,
    materialColor: number,
    position: THREE.Vector3
): THREE.Mesh => {
    const material = new THREE.MeshStandardMaterial({ color: materialColor });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    return mesh;
};

export function Timer() {
    const mountRef = useRef<HTMLDivElement>(null);
    const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const buttonPressRef = useRef<{ [key: string]: NodeJS.Timeout | null }>({});
    const animationIdRef = useRef<number | null>(null);
    const lightMeshRef = useRef<THREE.Mesh | null>(null);
    const buttonMeshRef = useRef<THREE.Mesh | null>(null);
    
    // State with proper typing
    const [state, setState] = useState<TimerState>({
        mode: 'stopwatch',
        displayFormat: 'hms',
        running: false,
        paused: false,
        time: 0,
        timerSet: 0,
        flash: false,
        startTime: null,
    });

    const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

    // Helper: Get max time for current mode/format
    const getMaxTime = useCallback((): number => {
        if (state.mode === 'timer') return TIMER_CONSTANTS.TIME_LIMITS.TIMER_MAX;
        if (state.displayFormat === 'hms') return TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_HMS_MAX;
        return TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_MS_MAX;
    }, [state.mode, state.displayFormat]);

    // Helper: Format time for display with proper error handling
    const formatTime = useCallback((t: number): string => {
        // Ensure t is a valid number
        const time = Math.max(0, Math.floor(t));
        
        if (state.mode === 'timer') {
            const hours = Math.floor(time / 3600).toString().padStart(2, '0');
            const minutes = Math.floor((time % 3600) / 60).toString().padStart(2, '0');
            const secs = (time % 60).toString().padStart(2, '0');
            return `${hours}:${minutes}:${secs}`;
        } else {
            if (state.displayFormat === 'hms') {
                // Stopwatch HMS format: HH:MM:SS (time is in seconds)
                const hours = Math.floor(time / 3600).toString().padStart(2, '0');
                const minutes = Math.floor((time % 3600) / 60).toString().padStart(2, '0');
                const secs = (time % 60).toString().padStart(2, '0');
                return `${hours}:${minutes}:${secs}`;
            } else {
                // Stopwatch MS format: MM:SS.CS (time is in centiseconds)
                const cs = time % 100;
                const totalSeconds = Math.floor(time / 100);
                const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                const secs = (totalSeconds % 60).toString().padStart(2, '0');
                return `${minutes}:${secs}.${cs.toString().padStart(2, '0')}`;
            }
        }
    }, [state.mode, state.displayFormat]);

    // Helper: Update display text with proper error handling
    const updateDisplayText = useCallback((displayTime: number) => {
        const ctx = canvasCtxRef.current;
        const texture = textureRef.current;
        
        if (!ctx || !texture) return;
        
        try {
            const displayText = formatTime(displayTime);
            
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = state.flash ? 
                (Date.now() % 600 < 300 ? TIMER_CONSTANTS.COLORS.TEXT_FLASH : TIMER_CONSTANTS.COLORS.TEXT_NORMAL) : 
                TIMER_CONSTANTS.COLORS.TEXT_NORMAL;
            ctx.font = '128px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayText, ctx.canvas.width / 2, ctx.canvas.height / 2);
            texture.needsUpdate = true;
        } catch (error) {
            console.error('Error updating display text:', error);
        }
    }, [formatTime, state.flash]);

    // Helper: Handle format toggle with proper state management
    const handleFormatToggle = useCallback(() => {
        if (state.mode === 'stopwatch') {
            setState(prevState => {
                const newFormat = prevState.displayFormat === 'hms' ? 'ms' : 'hms';
                let newTime = prevState.time;
                
                // Convert time value when switching formats
                if (prevState.displayFormat === 'hms' && newFormat === 'ms') {
                    // Converting from seconds to centiseconds
                    newTime = prevState.time * 100;
                } else if (prevState.displayFormat === 'ms' && newFormat === 'hms') {
                    // Converting from centiseconds to seconds
                    newTime = Math.floor(prevState.time / 100);
                }
                
                return {
                    ...prevState,
                    displayFormat: newFormat,
                    time: newTime,
                };
            });
        } else {
            // In timer mode, just toggle format without time conversion
            setState(prevState => ({
                ...prevState,
                displayFormat: prevState.displayFormat === 'hms' ? 'ms' : 'hms',
            }));
        }
    }, [state.mode]);

    // Helper: Handle start/stop button logic
    const handleStartStop = useCallback(() => {
        setState(prevState => {
            if (prevState.paused) {
                // Resume from pause - don't change start time
                return { ...prevState, paused: false, running: true };
            } else if (prevState.running) {
                // Pause the timer
                return { ...prevState, running: false, paused: true };
            } else {
                // Start the timer - record start time for stopwatch
                const now = new Date();
                return { 
                    ...prevState, 
                    running: true, 
                    paused: false,
                    startTime: prevState.mode === 'stopwatch' ? now : prevState.startTime
                };
            }
        });
    }, []);

    // Helper: Format date/time in Eastern Time
    const formatEasternTime = useCallback((date: Date): string => {
        const options: Intl.DateTimeFormatOptions = {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        
        const formatted = date.toLocaleString('en-US', options);
        
        // Convert from "MM/DD/YYYY, HH:MM:SS AM/PM" to "YYYY.MM.DD HH:MM:SS AM/PM"
        const [datePart, timePart] = formatted.split(', ');
        const [month, day, year] = datePart.split('/');
        
        return `${year}.${month}.${day} ${timePart}`;
    }, []);

    // Helper: Handle logging a stopwatch session
    const handleLog = useCallback(() => {
        if (state.mode === 'stopwatch' && state.startTime && state.time > 0) {
            const logEntry: LogEntry = {
                id: Date.now().toString(),
                startTime: state.startTime,
                duration: state.time,
                formattedDuration: formatTime(state.time)
            };
            
            setLogEntries(prevEntries => [logEntry, ...prevEntries]);
            
            // Reset the timer
            setState(prevState => ({
                ...prevState,
                running: false,
                paused: false,
                time: 0,
                startTime: null,
            }));
        }
    }, [state.mode, state.startTime, state.time, formatTime]);

    useEffect(() => {
        if (!mountRef.current) return;
        
        // Store mountRef.current in a variable for cleanup
        const mountElement = mountRef.current;

        // --- Scene and Renderer Setup ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.PerspectiveCamera(
            35, 
            TIMER_CONSTANTS.CANVAS.WIDTH / TIMER_CONSTANTS.CANVAS.HEIGHT, 
            0.1, 
            1000
        );
        camera.position.set(0, -9, 9);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(TIMER_CONSTANTS.CANVAS.WIDTH, TIMER_CONSTANTS.CANVAS.HEIGHT);
        renderer.localClippingEnabled = true;
        mountElement.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        // --- Timer base ---
        const timerBaseColor = TIMER_CONSTANTS.COLORS.TIMER_BASE;
        const cardWidth = TIMER_CONSTANTS.DIMENSIONS.CARD_WIDTH;
        const cardHeight = TIMER_CONSTANTS.DIMENSIONS.CARD_HEIGHT;
        const cardThickness = TIMER_CONSTANTS.DIMENSIONS.CARD_THICKNESS;

        // Bottom half: box with diagonal clipping plane
        const boxHeight = cardHeight / 2 + cardThickness / 2;
        const boxGeometry = new THREE.BoxGeometry(cardWidth, boxHeight, cardThickness);
        const diagonalPlane = new THREE.Plane(new THREE.Vector3(0, 1, -1).normalize(), boxHeight / Math.sqrt(3));
        const boxMaterial = new THREE.MeshStandardMaterial({
            color: timerBaseColor,
            clippingPlanes: [diagonalPlane]
        });
        const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
        boxMesh.position.y = -boxHeight / 2;
        scene.add(boxMesh);

        // Fill in the clipped diagonal space
        const fillThickness = 0.2;
        const fillGeometry = new THREE.BoxGeometry(cardWidth, fillThickness, cardThickness + 0.3);
        const fillMaterial = new THREE.MeshStandardMaterial({ color: timerBaseColor });
        const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
        fillMesh.position.set(0, -boxHeight + 0.75, -0.04);
        fillMesh.rotation.x = -Math.PI / 4;
        scene.add(fillMesh);

        // --- Timer Text ---
        const canvas = document.createElement('canvas');
        canvas.width = TIMER_CONSTANTS.CANVAS.TEXT_WIDTH;
        canvas.height = TIMER_CONSTANTS.CANVAS.TEXT_HEIGHT;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            throw new Error('Failed to get 2D context for timer text canvas');
        }
        
        // Store refs for later use instead of global variables
        canvasCtxRef.current = ctx;
        
        const texture = new THREE.CanvasTexture(canvas);
        textureRef.current = texture;
        const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), textMaterial);
        textPlane.position.set(0, -boxHeight + 0.65, 0.15);
        textPlane.rotation.x = Math.PI / 4;
        scene.add(textPlane);

        // Timer text display box
        const textBoxGeometry = new THREE.BoxGeometry(2.5, 0.8, 0.05);
        const textBoxMaterial = new THREE.MeshStandardMaterial({
            color: TIMER_CONSTANTS.COLORS.DISPLAY_BOX,
            transparent: true,
            opacity: 0.8
        });

        const textBoxMesh = new THREE.Mesh(textBoxGeometry, textBoxMaterial);
        textBoxMesh.position.set(0, -boxHeight + 0.65, 0.1);
        textBoxMesh.rotation.x = Math.PI / 4;
        scene.add(textBoxMesh);

        // Logo below the display (not displaying right now - need to adjust position)
        const logoCanvas = document.createElement('canvas');
        logoCanvas.width = 512;
        logoCanvas.height = 128;
        const logoCtx = logoCanvas.getContext('2d');
        logoCtx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);
        logoCtx.fillStyle = '#000';
        logoCtx.font = '48px sans-serif';
        logoCtx.textAlign = 'center';
        logoCtx.textBaseline = 'middle';
        logoCtx.fillText('オンラインDRETEC', logoCanvas.width / 2, logoCanvas.height / 2);
        const logoTexture = new THREE.CanvasTexture(logoCanvas);
        const logoMaterial = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true });
        const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), logoMaterial);
        logoPlane.position.set(0, -boxHeight + 0.7, -0.5);
        logoPlane.rotation.x = Math.PI / 4;

        scene.add(logoPlane);   

        // Initial display with proper error handling
        try {
            const initialDisplayTime = state.mode === 'timer' && !state.running && !state.paused ? state.timerSet : state.time;
            updateDisplayText(initialDisplayTime);
        } catch (error) {
            console.error('Error setting initial display:', error);
        }

        // --- Top Half: Half-Cylinder ---
        const radius = cardWidth / 2;
        const halfCylinderHeight = cardThickness;
        const halfCylinderGeometry = new THREE.CylinderGeometry(
            radius,
            radius,
            halfCylinderHeight,
            64,
            1,
            false,
            Math.PI / 2,
            Math.PI
        );
        const halfCylinderMaterial = new THREE.MeshStandardMaterial({ color: timerBaseColor });
        const halfCylinderMesh = new THREE.Mesh(halfCylinderGeometry, halfCylinderMaterial);
        halfCylinderMesh.rotation.x = Math.PI / 2;
        halfCylinderMesh.position.y = 0;
        scene.add(halfCylinderMesh);

        // --- Mode Button ---
        const modeButtonWidth = 0.2;
        const modeButtonHeight = 0.5;
        const modeButtonX = -cardWidth / 2;
        const modeButtonShape = new THREE.Shape();
        modeButtonShape.moveTo(-modeButtonWidth / 2, -modeButtonHeight / 2);
        modeButtonShape.lineTo(modeButtonWidth / 2, -modeButtonHeight / 2);
        modeButtonShape.lineTo(modeButtonWidth / 2, modeButtonHeight / 2);
        modeButtonShape.lineTo(-modeButtonWidth / 2, modeButtonHeight / 2);
        modeButtonShape.lineTo(-modeButtonWidth / 2, -modeButtonHeight / 2);
        const modeButtonGeometry = new THREE.ExtrudeGeometry(modeButtonShape, {
            bevelEnabled: true,
            bevelThickness: 0.1,
            bevelSize: 0.02,
            bevelOffset: 0,
            bevelSegments: 5
        });
        const modeButtonMaterial = new THREE.MeshStandardMaterial({ 
            color: TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT 
        });
        const modeButtonMesh = new THREE.Mesh(modeButtonGeometry, modeButtonMaterial);
        modeButtonMesh.position.set(modeButtonX, -1.5, 0);
        modeButtonMesh.rotation.y = Math.PI / 2;
        scene.add(modeButtonMesh);

        const modeButtonMesh2 = modeButtonMesh.clone();
        modeButtonMesh2.position.set(modeButtonX, -0.8, 0);
        scene.add(modeButtonMesh2);

        // Side Button Labels
        // Mode Button
        const modeButtonCanvas = document.createElement('canvas');
        modeButtonCanvas.width = 256;
        modeButtonCanvas.height = 128;
        const modeLabelCtx = modeButtonCanvas.getContext('2d');
        modeLabelCtx.clearRect(0, 0, modeButtonCanvas.width, modeButtonCanvas.height);
        modeLabelCtx.fillStyle = '#000';
        modeLabelCtx.font = '84px sans-serif';
        modeLabelCtx.textAlign = 'center';
        modeLabelCtx.textBaseline = 'middle';
        modeLabelCtx.fillText('時/分', modeButtonCanvas.width / 2, modeButtonCanvas.height / 2);
        const modeLabelTexture = new THREE.CanvasTexture(modeButtonCanvas);
        const modeLabelMaterial = new THREE.MeshBasicMaterial({ map: modeLabelTexture, transparent: true });
        const modeLabelPlane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.01), modeLabelMaterial);
        modeLabelPlane.position.set(modeButtonX, -1.5, 0.2);
        modeLabelPlane.rotation.x = Math.PI / 2;
        modeLabelPlane.rotation.y = Math.PI / 2;
        scene.add(modeLabelPlane);

        // H/M Button
        const modeButtonCanvas2 = document.createElement('canvas');
        modeButtonCanvas2.width = 256;
        modeButtonCanvas2.height = 128;
        const modeLabelCtx2 = modeButtonCanvas2.getContext('2d');
        modeLabelCtx2.clearRect(0, 0, modeButtonCanvas2.width, modeButtonCanvas2.height);
        modeLabelCtx2.fillStyle = '#000';
        modeLabelCtx2.font = '84px sans-serif';
        modeLabelCtx2.textAlign = 'center';
        modeLabelCtx2.textBaseline = 'middle';
        modeLabelCtx2.fillText('モード', modeButtonCanvas2.width / 2, modeButtonCanvas2.height / 2);
        const modeLabelTexture2 = new THREE.CanvasTexture(modeButtonCanvas2);
        const modeLabelMaterial2 = new THREE.MeshBasicMaterial({ map: modeLabelTexture2, transparent: true });
        const modeLabelPlane2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.01), modeLabelMaterial2);
        modeLabelPlane2.position.set(modeButtonX, -0.8, 0.2);
        modeLabelPlane2.rotation.x = Math.PI / 2;
        modeLabelPlane2.rotation.y = Math.PI / 2;
        scene.add(modeLabelPlane2);

        // Front buttons
        // --- H/M/S Buttons ---
        const hmsButtonWidth = 0.5;
        const hmsButtonHeight = 0.2;
        const hmsButtonDepth = 0.1;
        const hmsButtonY = -1.8;
        const hmsButtonZ = 0.5;
        const hmsButtonShape = new THREE.Shape();
        hmsButtonShape.moveTo(-hmsButtonWidth / 2, -hmsButtonHeight / 2);
        hmsButtonShape.lineTo(hmsButtonWidth / 2, -hmsButtonHeight / 2);
        hmsButtonShape.lineTo(hmsButtonWidth / 2, hmsButtonHeight / 2);
        hmsButtonShape.lineTo(-hmsButtonWidth / 2, hmsButtonHeight / 2);
        hmsButtonShape.lineTo(-hmsButtonWidth / 2, -hmsButtonHeight / 2);
        const hmsButtonGeometry = new THREE.ExtrudeGeometry(hmsButtonShape, {
            depth: hmsButtonDepth,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelOffset: 0,
            bevelSegments: 5
        });
        const hmsButtonMaterial = new THREE.MeshStandardMaterial({ 
            color: TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT 
        });
        const hmsButtonMesh = new THREE.Mesh(hmsButtonGeometry, hmsButtonMaterial);
        hmsButtonMesh.position.set(1.2, hmsButtonY, hmsButtonZ);
        scene.add(hmsButtonMesh);

        const hmsButtonMesh2 = hmsButtonMesh.clone();
        hmsButtonMesh2.position.set(-1.2, hmsButtonY, hmsButtonZ);
        scene.add(hmsButtonMesh2);

        const hmsButtonMesh3 = hmsButtonMesh.clone();
        hmsButtonMesh3.position.set(0, hmsButtonY, hmsButtonZ);
        scene.add(hmsButtonMesh3);

        // H/M/S Buttons (Individual)
        // --- H Button ---
        const hButtonGeometry = new THREE.ExtrudeGeometry(hmsButtonShape, {
            depth: hmsButtonDepth,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelOffset: 0,
            bevelSegments: 5
        });
        const hButtonMaterial = new THREE.MeshStandardMaterial({ 
            color: TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT 
        });
        const hButtonMesh = new THREE.Mesh(hButtonGeometry, hButtonMaterial);
        hButtonMesh.position.set(-1.2, hmsButtonY, hmsButtonZ);
        scene.add(hButtonMesh);

        // --- M Button ---
        const mButtonGeometry = hButtonGeometry.clone();
        const mButtonMaterial = hButtonMaterial.clone();
        const mButtonMesh = new THREE.Mesh(mButtonGeometry, mButtonMaterial);
        mButtonMesh.position.set(0, hmsButtonY, hmsButtonZ);
        scene.add(mButtonMesh);

        // --- S Button ---
        const sButtonGeometry = hButtonGeometry.clone();
        const sButtonMaterial = hButtonMaterial.clone();
        const sButtonMesh = new THREE.Mesh(sButtonGeometry, sButtonMaterial);
        sButtonMesh.position.set(1.2, hmsButtonY, hmsButtonZ);
        scene.add(sButtonMesh);

        // H/M/S Labels
        const hmsLabelY = hmsButtonY - 0.3;
        const hmsLabelZ = hmsButtonZ + 0.05;
        scene.add(
            createButtonLabel('時', new THREE.Vector3(-1.2, hmsLabelY, hmsLabelZ)),
            createButtonLabel('分', new THREE.Vector3(0, hmsLabelY, hmsLabelZ)),
            createButtonLabel('秒', new THREE.Vector3(1.2, hmsLabelY, hmsLabelZ))
        );

        // Leading lines for Reset button (between M and S buttons)
        const material = new THREE.LineBasicMaterial( { color: 0x000000 } );
        let points = [
            new THREE.Vector3(0, hmsButtonY, hmsButtonZ),
            new THREE.Vector3(0, hmsButtonY + 0.2, hmsButtonZ),
            new THREE.Vector3(0.4, hmsButtonY + 0.2, hmsButtonZ)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints( points );
        const line = new THREE.Line( geometry, material );

        points = [
            new THREE.Vector3(1.2, hmsButtonY, hmsButtonZ),
            new THREE.Vector3(1.2, hmsButtonY + 0.2, hmsButtonZ),
            new THREE.Vector3(0.8, hmsButtonY + 0.2, hmsButtonZ)
        ];
        const geometry2 = new THREE.BufferGeometry().setFromPoints( points );
        const line2 = new THREE.Line( geometry2, material );
        scene.add( line );
        scene.add( line2 );

        // --- Reset Button ---
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 128;
        const labelCtx = labelCanvas.getContext('2d');
        labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
        labelCtx.fillStyle = '#000';
        labelCtx.font = '84px sans-serif';
        labelCtx.textAlign = 'center';
        labelCtx.textBaseline = 'middle';
        labelCtx.fillText('リセット', labelCanvas.width / 2, labelCanvas.height / 2); 
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true });
        const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), labelMaterial);
        labelPlane.position.set(0.6, hmsButtonY + 0.2, hmsButtonZ + 0.01);
        scene.add(labelPlane);

        // --- Start/Stop Button ---
        const buttonRadius = TIMER_CONSTANTS.DIMENSIONS.BUTTON_RADIUS;
        const buttonHeight = TIMER_CONSTANTS.DIMENSIONS.BUTTON_HEIGHT;
        const buttonGeometry = new THREE.CylinderGeometry(buttonRadius, buttonRadius, buttonHeight, 64);
        const buttonMaterial = new THREE.MeshPhysicalMaterial({
            color: TIMER_CONSTANTS.COLORS.BUTTON_NORMAL,
            roughness: 0.5,
            transmission: 1,
            thickness: 1
        });
        const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
        buttonMesh.position.set(0, 0.1, 0.6);
        buttonMesh.rotation.x = Math.PI / 2;
        scene.add(buttonMesh);
        
        // Store ref for later updates
        buttonMeshRef.current = buttonMesh;

        // Button Top
        const buttonTop = new THREE.IcosahedronGeometry(1.85, 15);
        const buttonTopMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xd3d7d9,
            roughness: 0.5,
            transmission: 1,
            thickness: 1,
            transparent: true,
            clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 0, 1), buttonHeight / 3)]
        });
        const buttonTopMesh = new THREE.Mesh(buttonTop, buttonTopMaterial);
        buttonTopMesh.position.set(0, 0.1 + buttonHeight / 2, -0.5);
        scene.add(buttonTopMesh);

        // --- Red Light Indicator ---
        const lightGeometry = new THREE.CircleGeometry(0.5, 64);
        const lightMaterial = new THREE.MeshStandardMaterial({
            color: TIMER_CONSTANTS.COLORS.LIGHT_INACTIVE,
            emissive: 0x000000
        });
        const lightMesh = new THREE.Mesh(lightGeometry, lightMaterial);
        lightMesh.position.set(0, 0.1, 0.55);
        scene.add(lightMesh);
        
        // Store refs for later updates
        lightMeshRef.current = lightMesh;

        // --- Raycaster for Button Click ---
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        // --- Helper: set button color based on active state ---
        const setButtonActiveColor = (mesh: THREE.Mesh, isActive: boolean, defaultColor: number) => {
            if (!mesh) return;
            const material = mesh.material as THREE.MeshStandardMaterial;
            material.color.set(isActive ? TIMER_CONSTANTS.COLORS.BUTTON_ACTIVE : defaultColor);
        };

        // --- Main click handler ---
        const handleClick = (event: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            const intersects = raycaster.intersectObjects([
                modeButtonMesh,
                modeButtonMesh2,
                hButtonMesh,
                mButtonMesh,
                sButtonMesh,
                buttonMesh,
                labelPlane
            ]);

            if (intersects.length > 0) {
                const clickedObject = intersects[0].object;

                // Highlight the clicked button
                setButtonActiveColor(clickedObject as THREE.Mesh, true, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);

                // Reset color after a short delay
                setTimeout(() => {
                    setButtonActiveColor(clickedObject as THREE.Mesh, false, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                }, 200);

                // Handle specific button logic
                if (clickedObject === buttonMesh) {
                    handleStartStop();
                } else if (clickedObject === modeButtonMesh2) {
                    // Mode button - toggle between timer and stopwatch
                    setState(prevState => ({
                        ...prevState,
                        mode: prevState.mode === 'timer' ? 'stopwatch' : 'timer',
                        running: false,
                        paused: false,
                        time: 0,
                        startTime: null,
                    }));
                } else if (clickedObject === modeButtonMesh) {
                    // H/M button - toggle display format
                    handleFormatToggle();
                } else if (clickedObject === labelPlane) {
                    // Reset button - reset time and stop
                    setState(prevState => ({
                        ...prevState,
                        running: false,
                        paused: false,
                        time: prevState.mode === 'timer' ? prevState.timerSet : 0,
                        startTime: null,
                    }));
                } else if (clickedObject === hButtonMesh) {
                    // H button - increment hours
                    if (!state.running && state.mode === 'timer') {
                        setState(prevState => {
                            const newVal = prevState.timerSet + 3600;
                            return {
                                ...prevState,
                                timerSet: newVal <= getMaxTime() ? newVal : prevState.timerSet,
                            };
                        });
                    }
                } else if (clickedObject === mButtonMesh) {
                    // M button - increment minutes
                    if (!state.running && state.mode === 'timer') {
                        setState(prevState => {
                            const newVal = prevState.timerSet + 60;
                            return {
                                ...prevState,
                                timerSet: newVal <= getMaxTime() ? newVal : prevState.timerSet,
                            };
                        });
                    }
                } else if (clickedObject === sButtonMesh) {
                    // S button - increment seconds
                    if (!state.running && state.mode === 'timer') {
                        setState(prevState => {
                            const newVal = prevState.timerSet + 1;
                            return {
                                ...prevState,
                                timerSet: newVal <= getMaxTime() ? newVal : prevState.timerSet,
                            };
                        });
                    }
                }
            }
        };

        renderer.domElement.addEventListener('click', handleClick);

        // --- Mouse down handler for long press ---
        const handleMouseDown = (event: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            const intersects = raycaster.intersectObjects([hButtonMesh, mButtonMesh, sButtonMesh]);
            
            if (intersects.length > 0 && !state.running && state.mode === 'timer') {
                const clickedObject = intersects[0].object;
                let increment = 0;
                
                if (clickedObject === hButtonMesh) increment = 3600;
                else if (clickedObject === mButtonMesh) increment = 60;
                else if (clickedObject === sButtonMesh) increment = 1;
                
                if (increment > 0) {
                    const intervalId = setInterval(() => {
                        setState(prevState => {
                            const newVal = prevState.timerSet + increment;
                            return {
                                ...prevState,
                                timerSet: newVal <= getMaxTime() ? newVal : prevState.timerSet,
                            };
                        });
                    }, TIMER_CONSTANTS.INTERVALS.LONG_PRESS);
                    
                    buttonPressRef.current[clickedObject.uuid] = intervalId;
                }
            }
        };

        const handleMouseUp = () => {
            Object.values(buttonPressRef.current).forEach(intervalId => {
                if (intervalId) clearInterval(intervalId);
            });
            buttonPressRef.current = {};
        };

        renderer.domElement.addEventListener('mousedown', handleMouseDown);
        renderer.domElement.addEventListener('mouseup', handleMouseUp);
        renderer.domElement.addEventListener('mouseleave', handleMouseUp);

        // --- Animation Loop ---
        const animate = () => {
            controls.update();
            renderer.render(scene, camera);
            animationIdRef.current = requestAnimationFrame(animate);
        };
        animate();

        // --- Window Resize Handler ---
        const handleResize = () => {
            camera.aspect = TIMER_CONSTANTS.CANVAS.WIDTH / TIMER_CONSTANTS.CANVAS.HEIGHT;
            camera.updateProjectionMatrix();
            renderer.setSize(TIMER_CONSTANTS.CANVAS.WIDTH, TIMER_CONSTANTS.CANVAS.HEIGHT);
        };
        window.addEventListener('resize', handleResize);

        // --- Cleanup ---
        return () => {
            renderer.domElement.removeEventListener('click', handleClick);
            renderer.domElement.removeEventListener('mousedown', handleMouseDown);
            renderer.domElement.removeEventListener('mouseup', handleMouseUp);
            renderer.domElement.removeEventListener('mouseleave', handleMouseUp);
            window.removeEventListener('resize', handleResize);
            
            // Clear button press intervals
            Object.values(buttonPressRef.current).forEach(intervalId => {
                if (intervalId) clearInterval(intervalId);
            });
            buttonPressRef.current = {};
            
            // Cancel animation frame
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
                animationIdRef.current = null;
            }
            
            // Remove renderer from DOM
            if (mountElement && renderer.domElement.parentNode === mountElement) {
                mountElement.removeChild(renderer.domElement);
            }
            
            // Dispose Three.js resources
            try {
                renderer.dispose();
                
                // Dispose geometries
                [
                    boxGeometry, fillGeometry, textBoxGeometry, halfCylinderGeometry,
                    modeButtonGeometry, hmsButtonGeometry, hButtonGeometry, mButtonGeometry,
                    sButtonGeometry, buttonGeometry, buttonTop, lightGeometry
                ].forEach(geometry => {
                    if (geometry?.dispose) geometry.dispose();
                });
                
                // Dispose materials
                [
                    boxMaterial, fillMaterial, textMaterial, textBoxMaterial, halfCylinderMaterial,
                    modeButtonMaterial, hmsButtonMaterial, hButtonMaterial, mButtonMaterial,
                    sButtonMaterial, buttonMaterial, buttonTopMaterial, lightMaterial,
                    logoMaterial, modeLabelMaterial, modeLabelMaterial2, labelMaterial
                ].forEach(material => {
                    if (material?.dispose) material.dispose();
                });
                
                // Dispose textures
                [
                    texture, logoTexture, modeLabelTexture, modeLabelTexture2, labelTexture
                ].forEach(tex => {
                    if (tex?.dispose) tex.dispose();
                });
                
                // Clear refs
                canvasCtxRef.current = null;
                textureRef.current = null;
                lightMeshRef.current = null;
                buttonMeshRef.current = null;
            } catch (error) {
                console.error('Error during Three.js cleanup:', error);
            }
        };
    }, [state.mode, state.displayFormat, handleStartStop, handleFormatToggle, getMaxTime]);

    // Separate useEffect for timer/stopwatch logic
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        
        if (state.running && !state.paused) {
            if (state.mode === 'timer') {
                interval = setInterval(() => {
                    setState(prevState => {
                        if (prevState.time <= 1) {
                            return {
                                ...prevState,
                                running: false,
                                paused: false,
                                flash: true,
                                time: 0,
                            };
                        }
                        return {
                            ...prevState,
                            time: prevState.time - 1,
                        };
                    });
                }, TIMER_CONSTANTS.INTERVALS.TIMER);
            } else {
                // Stopwatch mode
                const interval_ms = state.displayFormat === 'hms' ? 
                    TIMER_CONSTANTS.INTERVALS.STOPWATCH_HMS : 
                    TIMER_CONSTANTS.INTERVALS.STOPWATCH_MS;
                    
                interval = setInterval(() => {
                    setState(prevState => {
                        const max = getMaxTime();
                        if (prevState.time >= max) return prevState;
                        return {
                            ...prevState,
                            time: prevState.time + 1,
                        };
                    });
                }, interval_ms);
            }
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [state.running, state.paused, state.mode, state.displayFormat, getMaxTime]);

    // Separate useEffect for updating the display text
    useEffect(() => {
        const ctx = canvasCtxRef.current;
        const texture = textureRef.current;
        
        if (ctx && texture) {
            // Show timerSet only when timer is completely stopped (not running AND not paused)
            // When paused, show the current time where it was paused
            const displayTime = state.mode === 'timer' && !state.running && !state.paused ? state.timerSet : state.time;
            updateDisplayText(displayTime);
        }
    }, [state.time, state.timerSet, state.mode, state.running, state.paused, state.flash, updateDisplayText]);

    useEffect(() => {
        // Flashing effect when timer ends
        let flashInterval: NodeJS.Timeout | null = null;
        if (state.flash) {
            flashInterval = setInterval(() => {
                setState(prevState => ({
                    ...prevState,
                    flash: !prevState.flash,
                }));
            }, TIMER_CONSTANTS.INTERVALS.FLASH);
            
            // Stop flashing after 2 seconds
            setTimeout(() => {
                setState(prevState => ({
                    ...prevState,
                    flash: false,
                }));
            }, 2000);
        }
        return () => {
            if (flashInterval) clearInterval(flashInterval);
        };
    }, [state.flash]);

    useEffect(() => {
        // Only reset time to timerSet when completely stopped (not running AND not paused)
        if (!state.running && !state.paused && state.mode === 'timer') {
            setState(prevState => ({
                ...prevState,
                time: prevState.timerSet,
            }));
        }
    }, [state.timerSet, state.running, state.paused, state.mode]);

    // Update light indicator and button appearance based on running state
    useEffect(() => {
        const lightMesh = lightMeshRef.current;
        const buttonMesh = buttonMeshRef.current;
        
        if (lightMesh) {
            const lightMaterial = lightMesh.material as THREE.MeshStandardMaterial;
            lightMaterial.color.set(state.running ? TIMER_CONSTANTS.COLORS.LIGHT_ACTIVE : TIMER_CONSTANTS.COLORS.LIGHT_INACTIVE);
            lightMaterial.emissive.set(state.running ? TIMER_CONSTANTS.COLORS.LIGHT_ACTIVE : 0x000000);
        }
        
        if (buttonMesh) {
            const buttonMaterial = buttonMesh.material as THREE.MeshPhysicalMaterial;
            buttonMaterial.color.set(state.running ? TIMER_CONSTANTS.COLORS.BUTTON_PRESSED : TIMER_CONSTANTS.COLORS.BUTTON_NORMAL);
            buttonMesh.position.z = state.running ? 0.55 : 0.6; // Adjust button position
        }
    }, [state.running]);

    return (
        <div className="w-full space-y-6">
            {/* Timer Card */}
            <Card className="flex items-center justify-center">
                <div ref={mountRef} className="relative"></div>
                {/* Debugging information */}
                {/* <div className="absolute top-2 left-2 bg-white/80 text-xs px-2 py-1 rounded shadow">
                    <div>Mode: {state.mode}</div>
                    <div>Display Format: {state.displayFormat}</div>
                    <div>Running: {state.running ? 'Yes' : 'No'}</div>
                    <div>Paused: {state.paused ? 'Yes' : 'No'}</div>
                    <div>Time: {formatTime(state.time)}</div>
                    <div>Timer Set: {formatTime(state.timerSet)}</div>
                </div> */}
            </Card>

            {/* Log Button - Only show in stopwatch mode */}
            {state.mode === 'stopwatch' && (
                <div className="flex justify-center">
                    <button
                        onClick={handleLog}
                        disabled={!state.startTime || state.time === 0}
                        className="px-6 py-1 border hover:bg-red-800 hover:text-white disabled:bg-white disabled:cursor-not-allowed transition-colors duration-200"
                    >
                    記
                    </button>
                </div>
            )}

            {/* Log Display */}
            {logEntries.length > 0 && (
                <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-gray-800">Sessions</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {logEntries.map((entry) => (
                            <div key={entry.id} className="pl-4 py-2 rounded-r">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-sm text-gray-600">
                                            {formatEasternTime(entry.startTime)}
                                        </div>
                                        <div className="text-lg font-semibold text-gray-800">
                                            {entry.formattedDuration}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setLogEntries(prev => prev.filter(e => e.id !== entry.id))}
                                        className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded"
                                        title="Delete entry"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {logEntries.length > 0 && (
                        <div className="mt-4 pt-4">
                            {/* Display Total Time */}
                            <div className="text-md text-gray-600">
                                Total Time: {formatTime(logEntries.reduce((acc, entry) => acc + entry.duration, 0))}
                            </div>

                            <button
                                onClick={() => setLogEntries([])}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                                Clear All Sessions
                            </button>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}