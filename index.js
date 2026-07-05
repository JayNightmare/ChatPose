'use strict';

try {
  require('./dist/main.js');
} catch (error) {
  console.error('Build output missing. Run `npm run build` before `npm start`.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
