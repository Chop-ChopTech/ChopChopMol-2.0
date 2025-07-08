const canvas = document.getElementById('explorationCanvas');
const canvasContainer = document.getElementById('analysisResponseContainer');
const ctx = canvas.getContext('2d');

// Set canvas size to match container
canvas.width = canvasContainer.clientWidth;
canvas.height = canvasContainer.clientHeight;

// Particle class for orbiting effect
class Particle {
    constructor() {
        this.radius = Math.random() * 3 + 2; // Particle size (2-5px)
        this.baseOrbitRadius = Math.random() * 150 + 50; // Orbit radius (50-150px)
        this.orbitRadius = this.baseOrbitRadius;
        this.angle = Math.random() * Math.PI * 2; // Random starting angle
        this.speed = Math.random() * 0.04 + 0.01; // Orbit speed
        this.centerX = canvas.width / 2;
        this.centerY = canvas.height / 2;
    }

    update() {
        this.angle += this.speed; // Update angle for orbit
        this.x = this.centerX + Math.cos(this.angle) * this.orbitRadius;
        this.y = this.centerY + Math.sin(this.angle) * this.orbitRadius;
        this.orbitRadius = this.baseOrbitRadius * (1 + (1 + Math.sin(Date.now() / 500)) / 2);
    }

    draw() {
        // Pulsating gradient based on time and position
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        const hue = (Date.now() / 10 + this.angle * 180 / Math.PI) % 360;
        gradient.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 70%, 0)`);

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }
}

// Create particles
const particleCount = 130;
const particles = Array.from({ length: particleCount }, () => new Particle());

// Animation loop
function animate() {
    // Fade previous frames while preserving transparency
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; // Increased alpha for cleaner fade
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over'; // Reset for drawing particles

    // Update and draw particles
    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });

    requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    particles.forEach(p => {
        p.centerX = canvas.width / 2;
        p.centerY = canvas.height / 2;
    });
});

// Start animation
animate();