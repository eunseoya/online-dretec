'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from './card';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Utility: Create a text label mesh for buttons
const createButtonLabel = (
    text: string,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
) => {
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 72;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    labelCtx.fillStyle = '#000';
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

export function Timer() {
    const mountRef = useRef(null);
    const [running, setRunning] = useState(false);
    const [time, setTime] = useState(0); // Time in seconds

    useEffect(() => {
        // --- Scene and Renderer Setup ---
        const CANVAS_WIDTH = 800;
        const CANVAS_HEIGHT = 512;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.PerspectiveCamera(35, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 1000);
        camera.position.set(0, -9, 9);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
        mountRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        // --- Card Base Geometry ---
        const timerBaseColor = 0xfcfcff;
        const cardWidth = 4;
        const cardHeight = 6;
        const cardThickness = 1;

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
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), textMaterial);
        textPlane.position.set(0, -boxHeight + 0.65, 0.15);
        textPlane.rotation.x = Math.PI / 4;
        scene.add(textPlane);

        // Box behind text
        const textBoxGeometry = new THREE.BoxGeometry(2.5, 0.8, 0.05);
        const textBoxMaterial = new THREE.MeshStandardMaterial({
            color: 0x9ea79c,
            transparent: true,
            opacity: 0.8
        });
        const textBoxMesh = new THREE.Mesh(textBoxGeometry, textBoxMaterial);
        textBoxMesh.position.set(0, -boxHeight + 0.65, 0.1);
        textBoxMesh.rotation.x = Math.PI / 4;
        scene.add(textBoxMesh);

        // Update timer text
        const updateText = (seconds: number) => {
            const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
            const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.font = '128px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${hours}:${minutes}:${secs}`, canvas.width / 2, canvas.height / 2);
            texture.needsUpdate = true;
        };
        updateText(time);

        renderer.localClippingEnabled = true;

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

        // --- Date Button ---
        const dateButtonWidth = 0.2;
        const dateButtonHeight = 0.5;
        const dateButtonX = -cardWidth / 2;
        const dateButtonShape = new THREE.Shape();
        dateButtonShape.moveTo(-dateButtonWidth / 2, -dateButtonHeight / 2);
        dateButtonShape.lineTo(dateButtonWidth / 2, -dateButtonHeight / 2);
        dateButtonShape.lineTo(dateButtonWidth / 2, dateButtonHeight / 2);
        dateButtonShape.lineTo(-dateButtonWidth / 2, dateButtonHeight / 2);
        dateButtonShape.lineTo(-dateButtonWidth / 2, -dateButtonHeight / 2);
        const dateButtonGeometry = new THREE.ExtrudeGeometry(dateButtonShape, {
            bevelEnabled: true,
            bevelThickness: 0.1,
            bevelSize: 0.02,
            bevelOffset: 0,
            bevelSegments: 5
        });
        const dateButtonMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        const dateButtonMesh = new THREE.Mesh(dateButtonGeometry, dateButtonMaterial);
        dateButtonMesh.position.set(dateButtonX, -1.5, 0);
        dateButtonMesh.rotation.y = Math.PI / 2;
        scene.add(dateButtonMesh);

        const dateButtonMesh2 = dateButtonMesh.clone();
        dateButtonMesh2.position.set(dateButtonX, -0.8, 0);
        scene.add(dateButtonMesh2);

        const dLabel = createButtonLabel('D', new THREE.Vector3(dateButtonX - 0.1, -1.5, 0));
        dLabel.rotation.y = Math.PI / 2;
        scene.add(dLabel);

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
        const hmsButtonMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        const hmsButtonMesh = new THREE.Mesh(hmsButtonGeometry, hmsButtonMaterial);
        hmsButtonMesh.position.set(1.2, hmsButtonY, hmsButtonZ);
        scene.add(hmsButtonMesh);

        const hmsButtonMesh2 = hmsButtonMesh.clone();
        hmsButtonMesh2.position.set(-1.2, hmsButtonY, hmsButtonZ);
        scene.add(hmsButtonMesh2);

        const hmsButtonMesh3 = hmsButtonMesh.clone();
        hmsButtonMesh3.position.set(0, hmsButtonY, hmsButtonZ);
        scene.add(hmsButtonMesh3);

        // H/M/S Labels
        const hmsLabelY = hmsButtonY - 0.3;
        const hmsLabelZ = hmsButtonZ + 0.05;
        const hLabel = createButtonLabel('時', new THREE.Vector3(-1.2, hmsLabelY, hmsLabelZ));
        const mLabel = createButtonLabel('分', new THREE.Vector3(0, hmsLabelY, hmsLabelZ));
        const sLabel = createButtonLabel('秒', new THREE.Vector3(1.2, hmsLabelY, hmsLabelZ));
        scene.add(hLabel);
        scene.add(mLabel);
        scene.add(sLabel);

        // --- Start/Stop Button ---
        const buttonRadius = 1.5;
        const buttonHeight = 0.1;
        const buttonGeometry = new THREE.CylinderGeometry(buttonRadius, buttonRadius, buttonHeight, 64);
        const buttonMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xd3d7d9,
            roughness: 0.5,
            transmission: 1,
            thickness: 1
        });
        const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
        buttonMesh.position.set(0, 0.1, 0.6);
        buttonMesh.rotation.x = Math.PI / 2;
        scene.add(buttonMesh);

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
            color: running ? 0xfe6d59 : 0x3c3c3c,
            emissive: running ? 0xfe6d59 : 0x000000
        });
        const lightMesh = new THREE.Mesh(lightGeometry, lightMaterial);
        lightMesh.position.set(0, 0.1, 0.55);
        scene.add(lightMesh);

        // --- Raycaster for Button Click ---
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        const handleClick = (event: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            const intersects = raycaster.intersectObject(buttonMesh);
            if (intersects.length > 0) {
                setRunning((prev) => !prev);
                buttonMaterial.color.set((prev) => (prev ? 0x999999 : 0x666666));
                buttonMesh.position.z = (prev) => (prev ? 0.1 : 0.05);
            }
        };
        renderer.domElement.addEventListener('click', handleClick);

        // --- Light Animation ---
        const lightPulse = () => {
            if (running) {
                lightMaterial.color.set(running ? 0xff3333 : 0x3c3c3c);
                lightMaterial.emissive.set(running ? 0xff3333 : 0x000000);
            }
            requestAnimationFrame(lightPulse);
        };

        // --- Timer Update ---
        let interval: NodeJS.Timeout | null = null;
        if (running) {
            lightPulse();
            interval = setInterval(() => {
                setTime((prev) => {
                    const newTime = prev + 1;
                    updateText(newTime);
                    return newTime;
                });
            }, 1000);
        }

        // --- Animation Loop ---
        const animate = () => {
            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        };
        animate();

        // --- Window Resize Handler ---
        const handleResize = () => {
            camera.aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
            camera.updateProjectionMatrix();
            renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
        };
        window.addEventListener('resize', handleResize);

        // --- Cleanup ---
        return () => {
            renderer.domElement.removeEventListener('click', handleClick);
            window.removeEventListener('resize', handleResize);
            if (interval) clearInterval(interval);
            if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, [running]);

    return (
        <Card className="flex items-center justify-center">
            <div ref={mountRef} className="relative"></div>
        </Card>
    );
}