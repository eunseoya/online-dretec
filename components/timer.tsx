'use client';

import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { Card } from './card.jsx';
import { useSession } from '../contexts/SessionContext';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// --- Constants ---
const TIMER_CONSTANTS = {
    CANVAS: { TEXT_WIDTH: 550, TEXT_HEIGHT: 128 },
    COLORS: {
        TIMER_BASE: 0xffffff,
        BUTTON_DEFAULT: 0xafb1b0,
        BUTTON_ACTIVE: 0xd3d7d9,
        BUTTON_PRESSED: 0xafb1b0,
        BUTTON_NORMAL: 0xd3d7d9,
        LIGHT_ACTIVE: 0xff3333,
        LIGHT_INACTIVE: 0x3c3c3c,
        DISPLAY_BOX: 0xa1a29b,
        TEXT_NORMAL: '#000000',
        TEXT_INACTIVE: '#888888',
        TEXT_FLASH: '#ff0000',
        BUTTON_BG_NORMAL: 0x333333,
        BUTTON_BG_HOVER: 0x444444,
        BUTTON_BG_ACTIVE: 0x555555
    },
    TIME_LIMITS: {
        TIMER_MAX: 99 * 3600 + 59 * 60 + 59,
        STOPWATCH_HMS_MAX: 99 * 3600 + 59 * 60 + 59,
        STOPWATCH_MS_MAX: 59 * 60 * 100 + 99
    },
    INTERVALS: { TIMER: 1000, STOPWATCH_HMS: 1000, STOPWATCH_MS: 10, LONG_PRESS: 200, FLASH: 300 },
    DIMENSIONS: { CARD_WIDTH: 4, CARD_HEIGHT: 6, CARD_THICKNESS: 1, BUTTON_RADIUS: 1.5, BUTTON_HEIGHT: 0.1 }
} as const;

// --- Types ---
type TimerMode = 'clock' | 'timer' | 'stopwatch';
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
    pausedAccum: number;
}

// --- Helpers ---
const formatTimeForLog = (time: number, format: DisplayFormat): string => {
    if (format === 'hms') {
        const h = Math.floor(time / 3600)
            .toString()
            .padStart(2, '0');
        const m = Math.floor((time % 3600) / 60)
            .toString()
            .padStart(2, '0');
        const s = Math.floor(time % 60)
            .toString()
            .padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    const cs = Math.floor(time * 100)
        .toString()
        .padStart(2, '0');
    const s = Math.floor(time).toString().padStart(2, '0');
    const m = Math.floor(time / 60)
        .toString()
        .padStart(2, '0');
    return `${m}:${s}`;
};

const createButtonLabel = (text: string, position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): THREE.Mesh => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for label canvas');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = TIMER_CONSTANTS.COLORS.TEXT_NORMAL;
    ctx.font = '84px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), material);
    mesh.position.copy(position);
    return mesh;
};

const createButtonMesh = (
    geometry: THREE.ExtrudeGeometry,
    materialColor: number,
    position: THREE.Vector3
): THREE.Mesh => {
    const material = new THREE.MeshStandardMaterial({ color: materialColor });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    return mesh;
};

// --- Main Component ---
const TimerComponent: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const buttonPressRef = useRef<{ [key: string]: NodeJS.Timeout | null }>({});
    const animationIdRef = useRef<number | null>(null);
    const lightMeshRef = useRef<THREE.Mesh | null>(null);
    const buttonMeshRef = useRef<THREE.Mesh | null>(null);
    const logButtonMeshRef = useRef<THREE.Mesh | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

    // --- State ---
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 550 });
    const [state, setState] = useState<TimerState>({
        mode: 'clock',
        displayFormat: 'hms',
        running: false,
        paused: false,
        time: 0,
        timerSet: 0,
        flash: false,
        startTime: null,
        pausedAccum: 0
    });

    // Use session context instead of local state
    const { sessions: logEntries, addSession, clearSessions, removeSession, timezone } = useSession();

    // --- Derived/Helper Callbacks ---
    const getMaxTime = useCallback((): number => {
        if (state.mode === 'timer') return TIMER_CONSTANTS.TIME_LIMITS.TIMER_MAX;
        return state.displayFormat === 'hms'
            ? TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_HMS_MAX
            : TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_MS_MAX;
    }, [state.mode, state.displayFormat]);

    const formatTimeForDisplay = useCallback(
        (t: number): string => {
            if (state.mode === 'clock') {
                const now = new Date();
                const options: Intl.DateTimeFormatOptions = {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                };
                return now.toLocaleTimeString('en-US', options);
            }
            const time = Math.max(0, Math.floor(t));
            if (state.mode === 'timer' || (state.mode === 'stopwatch' && state.displayFormat === 'hms')) {
                const h = Math.floor(time / 3600)
                    .toString()
                    .padStart(2, '0');
                const m = Math.floor((time % 3600) / 60)
                    .toString()
                    .padStart(2, '0');
                const s = (time % 60).toString().padStart(2, '0');
                return `${h}H${m}M${s}S`;
            }
            // Stopwatch ms format
            const cs = time % 100;
            const totalSeconds = Math.floor(time / 100);
            const m = Math.floor(totalSeconds / 60)
                .toString()
                .padStart(2, '0');
            const s = (totalSeconds % 60).toString().padStart(2, '0');
            return `${m}M${s}S${cs.toString().padStart(2, '0')}`;
        },
        [state.mode, state.displayFormat, timezone]
    );

    const updateDisplayText = useCallback(
        (displayTime: number) => {
            const ctx = canvasCtxRef.current,
                texture = textureRef.current;
            if (!ctx || !texture) return;
            try {
                const displayText =
                    state.mode === 'clock' ? formatTimeForDisplay(0) : formatTimeForDisplay(displayTime);
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                const textColor = state.flash
                    ? Date.now() % 600 < 300
                        ? TIMER_CONSTANTS.COLORS.TEXT_FLASH
                        : TIMER_CONSTANTS.COLORS.TEXT_NORMAL
                    : TIMER_CONSTANTS.COLORS.TEXT_NORMAL;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const centerX = ctx.canvas.width / 2,
                    centerY = ctx.canvas.height / 2;
                let totalWidth = 0;
                for (let i = 0; i < displayText.length; i++) {
                    const char = displayText[i];
                    ctx.font = /[\d:.]/.test(char) ? '128px sans-serif' : '32px sans-serif';
                    totalWidth += ctx.measureText(char).width;
                }
                let currentX = centerX - totalWidth / 2;
                for (let i = 0; i < displayText.length; i++) {
                    const char = displayText[i];
                    ctx.fillStyle = textColor;
                    ctx.font = /[\d:.]/.test(char) ? '128px sans-serif' : '32px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    const charWidth = ctx.measureText(char).width;
                    const yPosition = centerY - (/[\d:.]/.test(char) ? 64 : 48);
                    ctx.fillText(char, currentX, yPosition);
                    currentX += charWidth;
                }
                texture.needsUpdate = true;
            } catch (error) {
                console.error('Error updating display text:', error);
            }
        },
        [formatTimeForDisplay, state.flash, state.mode]
    );

    const handleFormatToggle = useCallback(() => {
        setState((prev) =>
            !prev.running && !prev.paused
                ? { ...prev, displayFormat: prev.displayFormat === 'hms' ? 'ms' : 'hms' }
                : prev
        );
    }, []);

    const handleStartStop = useCallback(() => {
        setState((prev) => {
            if (prev.mode === 'clock') {
                return {
                    ...prev,
                    mode: 'stopwatch',
                    running: true,
                    paused: false,
                    time: 0,
                    pausedAccum: 0,
                    startTime: new Date()
                };
            } else if (prev.mode === 'timer') {
                if (prev.timerSet === 0) return prev;
                if (prev.paused) {
                    return { ...prev, running: true, paused: false, startTime: new Date() };
                } else if (prev.running) {
                    const now = new Date();
                    let elapsed = prev.startTime ? Math.floor((now.getTime() - prev.startTime.getTime()) / 1000) : 0;
                    return {
                        ...prev,
                        running: false,
                        paused: true,
                        pausedAccum: prev.pausedAccum + elapsed,
                        startTime: null,
                        time: Math.max(0, prev.timerSet - (prev.pausedAccum + elapsed))
                    };
                } else {
                    return {
                        ...prev,
                        running: true,
                        paused: false,
                        startTime: new Date(),
                        pausedAccum: 0,
                        time: prev.timerSet
                    };
                }
            } else {
                if (prev.paused) {
                    return { ...prev, running: true, paused: false, startTime: new Date() };
                } else if (prev.running) {
                    let now = new Date();
                    let elapsed = prev.startTime
                        ? Math.floor(
                              (now.getTime() - prev.startTime.getTime()) / (prev.displayFormat === 'hms' ? 1000 : 10)
                          )
                        : 0;
                    return {
                        ...prev,
                        running: false,
                        paused: true,
                        pausedAccum: prev.pausedAccum + elapsed,
                        startTime: null
                    };
                } else {
                    return { ...prev, running: true, paused: false, startTime: new Date() };
                }
            }
        });
    }, []);

    const handleReset = useCallback(() => {
        setState((prev) => ({
            ...prev,
            mode: 'clock',
            running: false,
            paused: false,
            time: 0,
            timerSet: 0,
            startTime: null,
            pausedAccum: 0
        }));
    }, []);

    const formatEasternTime = useCallback(
        (date: Date): string => {
            const options: Intl.DateTimeFormatOptions = {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            };
            const formatted = date.toLocaleString('en-US', options);
            const [datePart, timePart] = formatted.split(', ');
            const [month, day, year] = datePart.split('/');
            return `${year}.${month}.${day} ${timePart}`;
        },
        [timezone]
    );

    const handleLog = useCallback(() => {
        setState((prev) => {
            if (prev.mode !== 'stopwatch') return prev;
            if (prev.startTime && prev.time > 0) {
                const logEntry: LogEntry = {
                    id: Date.now().toString(),
                    startTime: prev.startTime,
                    duration: prev.time,
                    formattedDuration: formatTimeForLog(prev.time, prev.displayFormat)
                };
                addSession(logEntry);
            }
            handleReset();
            return { ...prev, running: false, paused: false, time: 0, startTime: null };
        });
    }, [handleReset, addSession]);

    // --- Effects: Three.js scene setup, animation, and cleanup ---
    useEffect(() => {
        if (!mountRef.current) return;
        const mountElement = mountRef.current;
        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width } = entry.contentRect;
                const aspectRatio = 800 / 550;
                const newHeight = width / aspectRatio;
                setCanvasSize({ width, height: newHeight });
            }
        });
        resizeObserver.observe(mountElement);

        // --- Scene and Renderer Setup ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.PerspectiveCamera(35, canvasSize.width / canvasSize.height, 0.1, 1000);
        camera.position.set(0, -9, 9);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(canvasSize.width, canvasSize.height);
        renderer.localClippingEnabled = true;
        rendererRef.current = renderer;
        mountElement.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        hemisphereLight.position.set(0, 20, 0);
        scene.add(hemisphereLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 1);
        fillLight.position.set(-5, -5, 5);
        scene.add(fillLight);

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
        fillMesh.position.set(0, -boxHeight + 0.8, -0.04);
        fillMesh.rotation.x = -Math.PI / 4;
        scene.add(fillMesh);

        // --- Timer Text ---
        const canvas = document.createElement('canvas');
        canvas.width = TIMER_CONSTANTS.CANVAS.TEXT_WIDTH;
        canvas.height = TIMER_CONSTANTS.CANVAS.TEXT_HEIGHT;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            console.warn('Failed to get 2D context for timer text canvas');
            return; // Exit early, component will still render but without text display
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
        const textBoxGeometry = new THREE.BoxGeometry(2.5, 0.7, 0.05);
        const textBoxMaterial = new THREE.MeshStandardMaterial({
            color: TIMER_CONSTANTS.COLORS.DISPLAY_BOX,
            transparent: true,
            opacity: 0.8
        });

        const textBoxMesh = new THREE.Mesh(textBoxGeometry, textBoxMaterial);
        textBoxMesh.position.set(0, -boxHeight + 0.7, 0.1);
        textBoxMesh.rotation.x = Math.PI / 4;
        scene.add(textBoxMesh);

        const logoImageSrc = '/images/dretec_logo.png'; // Use a local image path or URL

        // create a box with this image mapped onto it
        const logoBoxGeometry = new THREE.BoxGeometry(0.8, 0.25, 0.01);
        const logoBoxMaterial = new THREE.MeshBasicMaterial({
            map: new THREE.TextureLoader().load(logoImageSrc),
            transparent: true,
            color: 0x666666 // Darken the image by multiplying with gray color
        });
        const logoBoxMesh = new THREE.Mesh(logoBoxGeometry, logoBoxMaterial);
        logoBoxMesh.position.set(0, -boxHeight + 0.4, -0.3);
        logoBoxMesh.rotation.x = Math.PI / 4;
        scene.add(logoBoxMesh);

        // Uncomment this section to add a text logo instead of an image
        // const logoCanvas = document.createElement('canvas');
        // logoCanvas.width = 512;
        // logoCanvas.height = 128;
        // const logoCtx = logoCanvas.getContext('2d');
        // logoCtx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);
        // logoCtx.fillStyle = '#000';
        // logoCtx.font = '48px sans-serif';
        // logoCtx.textAlign = 'center';
        // logoCtx.textBaseline = 'middle';
        // logoCtx.fillText('dretec', logoCanvas.width / 2, logoCanvas.height / 2);
        // const logoTexture = new THREE.CanvasTexture(logoCanvas);
        // const logoMaterial = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true });
        // const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), logoMaterial);
        // logoPlane.position.set(0, -boxHeight + 0.3, -0.3);

        // logoPlane.rotation.x = Math.PI / 4;

        // scene.add(logoPlane);

        // Initial display with proper error handling
        try {
            const initialDisplayTime =
                state.mode === 'timer' && !state.running && !state.paused ? state.timerSet : state.time;
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
        // --- Log Button ---
        const logButtonRadius = 0.1;
        const logButtonDepth = 0.05;
        const logButtonX = cardWidth / 2 - 0.55;
        const logButtonGeometry = new THREE.CylinderGeometry(logButtonRadius, logButtonRadius, logButtonDepth, 32);
        const logButtonMaterial = new THREE.MeshStandardMaterial({
            color: TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT
        });
        const logButtonMesh = new THREE.Mesh(logButtonGeometry, logButtonMaterial);
        logButtonMesh.position.set(logButtonX, -boxHeight + 0.5, -0.1);
        logButtonMesh.rotation.x = -Math.PI / 4;
        logButtonMeshRef.current = logButtonMesh;
        scene.add(logButtonMesh);

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
        const material = new THREE.LineBasicMaterial({ color: 0x000000 });
        let points = [
            new THREE.Vector3(0, hmsButtonY, hmsButtonZ),
            new THREE.Vector3(0, hmsButtonY + 0.2, hmsButtonZ),
            new THREE.Vector3(0.4, hmsButtonY + 0.2, hmsButtonZ)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);

        points = [
            new THREE.Vector3(1.2, hmsButtonY, hmsButtonZ),
            new THREE.Vector3(1.2, hmsButtonY + 0.2, hmsButtonZ),
            new THREE.Vector3(0.8, hmsButtonY + 0.2, hmsButtonZ)
        ];
        const geometry2 = new THREE.BufferGeometry().setFromPoints(points);
        const line2 = new THREE.Line(geometry2, material);
        scene.add(line);
        scene.add(line2);

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
        const resetLabelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), labelMaterial);
        resetLabelPlane.position.set(0.6, hmsButtonY + 0.2, hmsButtonZ + 0.01);
        scene.add(resetLabelPlane);

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
                resetLabelPlane,
                ...(logButtonMeshRef.current ? [logButtonMeshRef.current] : [])
            ]);

            if (intersects.length > 0) {
                const clickedObject = intersects[0].object;

                // Highlight the clicked button
                setButtonActiveColor(clickedObject as THREE.Mesh, true, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);

                // Clicking reset label should set the light to active
                if (clickedObject === resetLabelPlane) {
                    setButtonActiveColor(hButtonMesh, true, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                    setButtonActiveColor(mButtonMesh, true, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                    setButtonActiveColor(sButtonMesh, true, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                    lightMesh.material.color.set(TIMER_CONSTANTS.COLORS.LIGHT_ACTIVE);
                    setTimeout(() => {
                        setButtonActiveColor(hButtonMesh, false, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                        setButtonActiveColor(mButtonMesh, false, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                        setButtonActiveColor(sButtonMesh, false, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                        lightMesh.material.color.set(TIMER_CONSTANTS.COLORS.LIGHT_INACTIVE);
                    }, 200);
                }
                // Reset color after a short delay
                setTimeout(() => {
                    setButtonActiveColor(clickedObject as THREE.Mesh, false, TIMER_CONSTANTS.COLORS.BUTTON_DEFAULT);
                }, 200);

                // Handle specific button logic
                if (clickedObject === buttonMesh) {
                    handleStartStop();
                } else if (clickedObject === modeButtonMesh2) {
                    // Mode button - toggle between timer and stopwatch
                    setState((prevState) => ({
                        ...prevState,
                        mode: prevState.mode === 'timer' ? 'stopwatch' : 'timer',
                        running: false,
                        paused: false,
                        time: 0,
                        startTime: null
                    }));
                } else if (clickedObject === modeButtonMesh) {
                    // H/M button - toggle display format
                    handleFormatToggle();
                } else if (clickedObject === resetLabelPlane) {
                    // Reset button - reset time and stop
                    handleReset();
                } else if (clickedObject === hButtonMesh) {
                    // H button - increment hours
                    setState((prevState) => {
                        if (!prevState.running && prevState.mode === 'timer') {
                            const maxTime =
                                prevState.mode === 'timer'
                                    ? TIMER_CONSTANTS.TIME_LIMITS.TIMER_MAX
                                    : prevState.displayFormat === 'hms'
                                      ? TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_HMS_MAX
                                      : TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_MS_MAX;
                            const newVal = prevState.timerSet + 3600;
                            return {
                                ...prevState,
                                timerSet: newVal <= maxTime ? newVal : prevState.timerSet
                            };
                        }
                        return prevState;
                    });
                } else if (clickedObject === mButtonMesh) {
                    // M button - increment minutes
                    setState((prevState) => {
                        if (!prevState.running && prevState.mode === 'timer') {
                            const maxTime =
                                prevState.mode === 'timer'
                                    ? TIMER_CONSTANTS.TIME_LIMITS.TIMER_MAX
                                    : prevState.displayFormat === 'hms'
                                      ? TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_HMS_MAX
                                      : TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_MS_MAX;
                            const newVal = prevState.timerSet + 60;
                            return {
                                ...prevState,
                                timerSet: newVal <= maxTime ? newVal : prevState.timerSet
                            };
                        }
                        return prevState;
                    });
                } else if (clickedObject === sButtonMesh) {
                    // S button - increment seconds
                    setState((prevState) => {
                        if (!prevState.running && prevState.mode === 'timer') {
                            const maxTime =
                                prevState.mode === 'timer'
                                    ? TIMER_CONSTANTS.TIME_LIMITS.TIMER_MAX
                                    : prevState.displayFormat === 'hms'
                                      ? TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_HMS_MAX
                                      : TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_MS_MAX;
                            const newVal = prevState.timerSet + 1;
                            return {
                                ...prevState,
                                timerSet: newVal <= maxTime ? newVal : prevState.timerSet
                            };
                        }
                        return prevState;
                    });
                } else if (clickedObject === logButtonMeshRef.current) {
                    // Log button - log the current stopwatch session
                    handleLog();
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

            if (intersects.length > 0) {
                const clickedObject = intersects[0].object;
                let increment = 0;

                if (clickedObject === hButtonMesh) increment = 3600;
                else if (clickedObject === mButtonMesh) increment = 60;
                else if (clickedObject === sButtonMesh) increment = 1;

                if (increment > 0) {
                    const intervalId = setInterval(() => {
                        setState((prevState) => {
                            if (!prevState.running && prevState.mode === 'timer') {
                                const maxTime =
                                    prevState.mode === 'timer'
                                        ? TIMER_CONSTANTS.TIME_LIMITS.TIMER_MAX
                                        : prevState.displayFormat === 'hms'
                                          ? TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_HMS_MAX
                                          : TIMER_CONSTANTS.TIME_LIMITS.STOPWATCH_MS_MAX;
                                const newVal = prevState.timerSet + increment;
                                return {
                                    ...prevState,
                                    timerSet: newVal <= maxTime ? newVal : prevState.timerSet
                                };
                            }
                            return prevState;
                        });
                    }, TIMER_CONSTANTS.INTERVALS.LONG_PRESS);

                    buttonPressRef.current[clickedObject.uuid] = intervalId;
                }
            }
        };

        const handleMouseUp = () => {
            Object.values(buttonPressRef.current).forEach((intervalId) => {
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
            if (cameraRef.current && rendererRef.current) {
                cameraRef.current.aspect = canvasSize.width / canvasSize.height;
                cameraRef.current.updateProjectionMatrix();
                rendererRef.current.setSize(canvasSize.width, canvasSize.height);
            }
        };

        // Update renderer size when canvasSize changes
        handleResize();

        // --- Cleanup ---
        return () => {
            resizeObserver.disconnect();
            renderer.domElement.removeEventListener('click', handleClick);
            renderer.domElement.removeEventListener('mousedown', handleMouseDown);
            renderer.domElement.removeEventListener('mouseup', handleMouseUp);
            renderer.domElement.removeEventListener('mouseleave', handleMouseUp);

            // Clear button press intervals
            Object.values(buttonPressRef.current).forEach((intervalId) => {
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
                    boxGeometry,
                    fillGeometry,
                    textBoxGeometry,
                    halfCylinderGeometry,
                    modeButtonGeometry,
                    hmsButtonGeometry,
                    hButtonGeometry,
                    mButtonGeometry,
                    sButtonGeometry,
                    buttonGeometry,
                    buttonTop,
                    lightGeometry
                ].forEach((geometry) => {
                    if (geometry?.dispose) geometry.dispose();
                });

                // Dispose materials
                [
                    boxMaterial,
                    fillMaterial,
                    textMaterial,
                    textBoxMaterial,
                    halfCylinderMaterial,
                    modeButtonMaterial,
                    hmsButtonMaterial,
                    hButtonMaterial,
                    mButtonMaterial,
                    sButtonMaterial,
                    buttonMaterial,
                    buttonTopMaterial,
                    lightMaterial,
                    modeLabelMaterial,
                    modeLabelMaterial2,
                    labelMaterial
                ].forEach((material) => {
                    if (material?.dispose) material.dispose();
                });

                // Dispose textures
                [texture, modeLabelTexture, modeLabelTexture2, labelTexture].forEach((tex) => {
                    if (tex?.dispose) tex.dispose();
                });

                // Clear refs
                canvasCtxRef.current = null;
                textureRef.current = null;
                lightMeshRef.current = null;
                buttonMeshRef.current = null;
                logButtonMeshRef.current = null;
            } catch (error) {
                console.error('Error during Three.js cleanup:', error);
            }
        };
    }, []);

    useEffect(() => {
        if (cameraRef.current && rendererRef.current) {
            cameraRef.current.aspect = canvasSize.width / canvasSize.height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(canvasSize.width, canvasSize.height);
        }
    }, [canvasSize]);

    // --- Stopwatch effect ---
    useEffect(() => {
        if (state.mode !== 'stopwatch') return;
        let animationFrame: number | null = null;
        const update = () => {
            if (state.running && state.startTime) {
                const now = new Date();
                const elapsed = Math.floor(
                    (now.getTime() - state.startTime.getTime()) / (state.displayFormat === 'hms' ? 1000 : 10)
                );
                setState((prev) => ({ ...prev, time: prev.pausedAccum + elapsed }));
                animationFrame = requestAnimationFrame(update);
            }
        };
        if (state.running && state.startTime) animationFrame = requestAnimationFrame(update);
        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [state.running, state.startTime, state.displayFormat, state.pausedAccum, state.mode]);

    // --- Timer countdown effect ---
    useEffect(() => {
        if (state.mode !== 'timer') return;
        let animationFrame: number | null = null;
        const update = () => {
            if (state.running && state.startTime) {
                const now = new Date();
                const elapsed = Math.floor((now.getTime() - state.startTime.getTime()) / 1000);
                const remaining = Math.max(0, state.timerSet - (state.pausedAccum + elapsed));
                setState((prev) => ({ ...prev, time: remaining }));
                if (remaining === 0) {
                    setState((prev) => ({
                        ...prev,
                        running: false,
                        paused: false,
                        flash: true,
                        time: 0,
                        startTime: null,
                        pausedAccum: 0
                    }));
                } else {
                    animationFrame = requestAnimationFrame(update);
                }
            }
        };
        if (state.running && state.startTime) animationFrame = requestAnimationFrame(update);
        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [state.running, state.startTime, state.timerSet, state.pausedAccum, state.mode]);

    // --- Display text update effect ---
    useEffect(() => {
        const ctx = canvasCtxRef.current,
            texture = textureRef.current;
        if (ctx && texture) {
            const displayTime = state.mode === 'timer' && !state.running && !state.paused ? state.timerSet : state.time;
            updateDisplayText(displayTime);
        }
    }, [state.time, state.timerSet, state.mode, state.running, state.paused, updateDisplayText]);

    // --- Flashing effect when timer ends ---
    useEffect(() => {
        let flashInterval: NodeJS.Timeout | null = null,
            stopFlashTimeout: NodeJS.Timeout | null = null;
        if (state.flash) {
            flashInterval = setInterval(() => {
                const ctx = canvasCtxRef.current,
                    texture = textureRef.current;
                if (ctx && texture) {
                    const displayTime =
                        state.mode === 'timer' && !state.running && !state.paused ? state.timerSet : state.time;
                    updateDisplayText(displayTime);
                }
            }, TIMER_CONSTANTS.INTERVALS.FLASH);
            stopFlashTimeout = setTimeout(() => {
                setState((prev) => ({ ...prev, flash: false, mode: 'clock', timerSet: 0 }));
            }, 3000);
        }
        return () => {
            if (flashInterval) clearInterval(flashInterval);
            if (stopFlashTimeout) clearTimeout(stopFlashTimeout);
        };
    }, [state.flash, state.mode, state.running, state.paused, state.timerSet, state.time, updateDisplayText]);

    // --- Reset time to timerSet when stopped ---
    useEffect(() => {
        if (!state.running && !state.paused && state.mode === 'timer' && !state.flash) {
            setState((prev) => ({ ...prev, time: prev.timerSet }));
        }
    }, [state.timerSet, state.running, state.paused, state.mode, state.flash]);

    // --- Update light/button appearance ---
    useEffect(() => {
        const lightMesh = lightMeshRef.current,
            buttonMesh = buttonMeshRef.current;
        if (lightMesh) {
            const mat = lightMesh.material as THREE.MeshStandardMaterial;
            if (state.flash) {
                const flashColor =
                    Date.now() % 1000 < 500
                        ? TIMER_CONSTANTS.COLORS.LIGHT_ACTIVE
                        : TIMER_CONSTANTS.COLORS.LIGHT_INACTIVE;
                mat.color.set(flashColor);
                mat.emissive.set(flashColor);
            } else {
                mat.color.set(
                    state.running ? TIMER_CONSTANTS.COLORS.LIGHT_ACTIVE : TIMER_CONSTANTS.COLORS.LIGHT_INACTIVE
                );
                mat.emissive.set(state.running ? TIMER_CONSTANTS.COLORS.LIGHT_ACTIVE : 0x000000);
            }
        }
        if (buttonMesh) {
            const mat = buttonMesh.material as THREE.MeshPhysicalMaterial;
            mat.color.set(state.running ? TIMER_CONSTANTS.COLORS.BUTTON_PRESSED : TIMER_CONSTANTS.COLORS.BUTTON_NORMAL);
            buttonMesh.position.z = state.running ? 0.55 : 0.6;
        }
    }, [state.running, state.flash]);

    // --- ET clock update ---
    useEffect(() => {
        if (state.mode !== 'clock') return;
        let interval: NodeJS.Timeout | null = null;
        interval = setInterval(() => {
            updateDisplayText(0);
        }, 1000);
        updateDisplayText(0);
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [state.mode, updateDisplayText]);

    // --- Render ---
    return (
        <div className="w-full space-y-6">
<Card title="Timer" className="flex items-center justify-center p-4">
<div ref={mountRef} className="w-full max-w-4xl relative" style={{ aspectRatio: '800/550' }}></div>
            </Card>
        </div>
    );
};

export const Timer = memo(TimerComponent);
