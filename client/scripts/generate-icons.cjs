const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const svgPath = path.join(__dirname, '../public/icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
    for (const size of sizes) {
        const outputPath = path.join(__dirname, `../public/icon-${size}.png`);
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(outputPath);
        console.log(`Generated ${outputPath}`);
    }
}

generateIcons().catch(console.error);
