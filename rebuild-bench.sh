#!/bin/bash

npm run build

./bin/terser -m -o bench/simple.min.js --source-map "includeSources,url=simple.min.js.map,scopes" --toplevel bench/simple.js bench/simple2.js
./bin/terser -m -o bench/common.min.js --source-map "includeSources,url=common.min.js.map,scopes" --toplevel ./bench/common.js
./bin/terser -m -o bench/sdk.min.js --source-map "includeSources,url=sdk.min.js.map,scopes" --toplevel bench/sdk.js
./bin/terser -m -o bench/typescript.min.js --source-map "includeSources,url=typescript.min.js.map,scopes" --toplevel node_modules/typescript/lib/typescript.js

./bin/terser -f "max_line_len,beautify,indent_level=2" -m -o bench/simple-formatted.min.js --source-map "includeSources,url=simple-formatted.min.js.map,scopes" --toplevel bench/simple.js bench/simple2.js
./bin/terser -f "max_line_len,beautify,indent_level=2" -m -o bench/common-formatted.min.js --source-map "includeSources,url=common-formatted.min.js.map,scopes" --toplevel ./bench/common.js
./bin/terser -f "max_line_len,beautify,indent_level=2" -m -o bench/sdk-formatted.min.js --source-map "includeSources,url=sdk-formatted.min.js.map,scopes" --toplevel bench/sdk.js
./bin/terser -f "max_line_len,beautify,indent_level=2" -m -o bench/typescript-formatted.min.js --source-map "includeSources,url=typescript-formatted.min.js.map,scopes" --toplevel node_modules/typescript/lib/typescript.js

