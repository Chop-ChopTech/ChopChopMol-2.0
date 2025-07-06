const canvas = document.getElementById('explorationCanvas');
const canvasContainer = document.getElementById('analysisResponseContainer');
const ctx = canvas.getContext('2d');

// Set canvas size to match window
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

// Create particles (adjust number here)
const particleCount = 230; // Increase/decrease for more/fewer particles
const particles = Array.from({ length: particleCount }, () => new Particle());

// Animation loop
function animate() {
    // Clear canvas with slight fade for trail effect
    ctx.fillStyle = 'rgba(10, 10, 26, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw particles
    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });

    requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles.forEach(p => {
        p.centerX = canvas.width / 2;
        p.centerY = canvas.height / 2;
    });
});

// Start animation
animate();

// Customization notes:
// - Change particleCount (line above) to adjust number of particles (e.g., 50 for more density).
// - Modify this.radius in Particle constructor for larger/smaller particles (e.g., Math.random() * 5 + 3).
// - Adjust this.orbitRadius for larger/smaller orbits (e.g., Math.random() * 200 + 100).
// - Change this.speed for faster/slower orbits (e.g., Math.random() * 0.05 + 0.02).
// - Modify gradient colors in draw() using hsla values for different hues.