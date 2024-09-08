const fs = require('fs');
const path = require('path');

// Function to increment the patch version
function incrementPatch(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
}

function updateVersion() {
    const packageJsonPath = path.resolve(__dirname, 'package.json');
    const versionJsonPath = path.resolve(__dirname, './public/version.json');

    try {
        // Read package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const packageVersion = packageJson.version;
        const [packageMajor, packageMinor] = packageVersion.split('.').map(Number);

        // Read version.json
        let versionData;
        if (fs.existsSync(versionJsonPath)) {
            versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
        } else {
            versionData = { version: '0.0.0' };
        }
        const currentVersion = versionData.version;
        const [currentMajor, currentMinor] = currentVersion.split('.').map(Number);

        let newVersion;
        if (packageMajor === currentMajor && packageMinor === currentMinor) {
            // Increment patch version if major and minor match
            newVersion = incrementPatch(currentVersion);
        } else {
            // Use package.json version if major or minor is different
            newVersion = packageVersion;
        }

        // Update version.json
        versionData.version = newVersion;
        fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

        console.log(`Updated version to: ${newVersion}`);
    } catch (err) {
        console.error('Error reading or updating version:', err.message);
        process.exit(1);
    }
}

// Run the update version function
updateVersion();