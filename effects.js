const canvas = document.getElementById('explorationCanvas');
const canvasContainer = document.getElementById('analysisResponseContainer');
const ctx = canvas.getContext('2d');

// Set canvas size to match container
canvas.width = canvasContainer.clientWidth;
canvas.height = canvasContainer.clientHeight;
let canvasOn = false;

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
        // Random offset for smooth noise-like variation
        this.noiseOffset1 = Math.random() * 100;
        this.noiseOffset2 = Math.random() * 100;
        this.vOut = 0
    }

    update() {
        this.angle += this.speed; // Update angle for orbit
        // Combine base pulsating effect with smooth random variation
        const time = Date.now() / 500;
        const pulsate = (1 + Math.sin(time)) / 2; // Original pulsating effect
        // Simulate smooth noise with two sine waves of different frequencies
        const randomVariation = (Math.sin(time * 0.1 + this.noiseOffset1) * 0.5 + 0.5) * 0.2
            + (Math.sin(time * 0.05 + this.noiseOffset2) * 0.5 + 0.5) * 0.1;
        if (canvasOn) {
            this.orbitRadius = this.baseOrbitRadius * (1 + pulsate * 0.5 + randomVariation * 0.3);
        } else {
            this.vOut += 0.05
            this.orbitRadius += this.vOut
        }
        this.x = this.centerX + Math.cos(this.angle) * this.orbitRadius;
        this.y = this.centerY + Math.sin(this.angle) * this.orbitRadius;
    }

    draw() {
        // Pulsating gradient based on time and position
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        let hue
        if (canvasOn) {
            hue = (Date.now() / 10 + this.angle * 180 / Math.PI) % 360;

        } else {
            hue = 60;

        }
        gradient.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 70%, 0)`);

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    remove() {
        this.vOut = 0

        const index = particles.indexOf(this);
        if (index > -1) {
            particles.splice(index, 1);
        }
    }
}

// Create particles
const particleCount = 130;
let particles = Array.from({ length: particleCount }, () => new Particle());

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
    if (!canvasOn) {
        particles.forEach(particle => {
            particle.orbitRadius += 9
            if (particle.orbitRadius > 1000) {
                particle.remove();
            }
        })

    }
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

const target = document.getElementById('explorationCanvas');

const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            if (target.classList.contains('on')) {
                console.log('canvas on')
                canvasOn = true;
                particles = Array.from({ length: particleCount }, () => new Particle());
            } else {
                console.log('canvas off')
                canvasOn = false;
            }
        }
    }
});

// Start observing class changes
observer.observe(target, {
    attributes: true,
    attributeFilter: ['class']
});


// Start animation
animate();