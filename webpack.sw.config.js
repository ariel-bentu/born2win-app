const path = require('path');

module.exports = {
    mode: 'production',
    entry: './sw-src/firebase-messaging-sw.ts',
    output: {
        filename: 'service-worker.js',  // Output filename for the service worker
        path: path.resolve(__dirname, 'public'),  // Output directory
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimize: false,  // Ensure the output is not minified
    },
    target: 'webworker',  // Ensure the target is set to webworker
};