/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.
  https://github.com/mishoo/UglifyJS2

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

"use strict";

import {SourceMapConsumer, SourceMapGenerator} from "@jridgewell/source-map";
import {defaults, HOP} from "./utils/index.js";

class InlineSite {
    constructor(file, line, col, gen_line, gen_col) {
        this.children = [];
        this.bindings = [];
        this.file = file;
        this.line = line;
        this.col = col;
        this.start_line = gen_line;
        this.start_col = gen_col;
        this.end_line = gen_line;
        this.end_col = gen_col;
    }
}

// a small wrapper around source-map and @jridgewell/source-map
async function SourceMap(options) {
    options = defaults(options, {
        file  : null,
        root  : null,
        orig  : null,
        files : {},
        scopes: null,
    });

    var orig_map;
    var generator = new SourceMapGenerator({
        file       : options.file,
        sourceRoot : options.root
    });

    var inline_tree = [];
    var bindings = [];
    var inline_stack = [];

    let sourcesContent = {__proto__: null};
    let files = options.files;
    for (var name in files) if (HOP(files, name)) {
        sourcesContent[name] = files[name];
    }
    if (options.orig) {
        // We support both @jridgewell/source-map (which has a sync
        // SourceMapConsumer) and source-map (which has an async
        // SourceMapConsumer).
        orig_map = await new SourceMapConsumer(options.orig);
        if (orig_map.sourcesContent) {
            orig_map.sources.forEach(function(source, i) {
                var content = orig_map.sourcesContent[i];
                if (content) {
                    sourcesContent[source] = content;
                }
            });
        }
    }

    function add(source, gen_line, gen_col, orig_line, orig_col, name, pos_inline_stack) {
        let generatedPos = { line: gen_line, column: gen_col };

        if (options.scopes) {
            // Add the current position into the inlining tree and update the current
            // inline stack position |inline_stack| to point to the corresponding node
            // in the inlining tree.
            if (!pos_inline_stack) {
                pos_inline_stack = [];
            }
            let i = 0;
            for (; i < pos_inline_stack.length && i < inline_stack.length; i++) {
                if (pos_inline_stack[i].file !== inline_stack[i].file ||
                    pos_inline_stack[i].line !== inline_stack[i].line ||
                    pos_inline_stack[i].col !== inline_stack[i].col) {
                    break;
                }
                inline_stack[i].end_line = gen_line;
                inline_stack[i].end_col = gen_col;
            }
            inline_stack.length = i;
            for (; i< pos_inline_stack.length; i++) {
                const site = new InlineSite(pos_inline_stack[i].file,
                    pos_inline_stack[i].line, pos_inline_stack[i].col, gen_line, gen_col);
                const parent_list = i ? inline_stack[i - 1].children : inline_tree;
                parent_list.push(site);
                inline_stack.push(site);
            }
        }

        if (orig_map) {
            var info = orig_map.originalPositionFor({
                line: orig_line,
                column: orig_col
            });
            if (info.source === null) {
                generator.addMapping({
                    generated: generatedPos,
                    original: null,
                    source: null,
                    name: null
                });
                return;
            }
            source = info.source;
            orig_line = info.line;
            orig_col = info.column;
            name = info.name || name;
        }
        generator.addMapping({
            generated : generatedPos,
            original  : { line: orig_line, column: orig_col },
            source    : source,
            name      : name
        });
        generator.setSourceContent(source, sourcesContent[source]);
    }

    function addVariable(gen_line, gen_col, gen_name, orig_file, orig_line, orig_col, orig_name) {
        if (!options.scopes) {
            return;
        }

        options.scopes.scopes.add_variable(undefined, orig_file, orig_line, orig_col, orig_name);
        options.scopes.gen_scopes.add_variable(undefined, 'gen', gen_line, gen_col, gen_name);

        // const current_bindings = inline_stack.length ? inline_stack.at(-1).bindings : bindings;
        // current_bindings.push({
        //     file: orig_file,
        //     line: orig_line,
        //     col: orig_col,
        //     name: orig_name,
        //     expr: gen_name,
        // });
    }

    function clean(map) {
        const allNull = map.sourcesContent && map.sourcesContent.every(c => c == null);
        if (allNull) delete map.sourcesContent;
        if (map.file === undefined) delete map.file;
        if (map.sourceRoot === undefined) delete map.sourceRoot;
        return map;
    }

    function buildIndexLookup(list) {
        const lookup = new Map();
        list.forEach((e, i) => lookup.set(e, i));
        return lookup;
    }

    function getOrCreate(lookupTable) {
        return s => {
            let result = lookupTable.get(s);
            if (!result) {
                result = lookupTable.size;
                lookupTable.set(s, result);
            }
            return result;
        };
    }

    function getDecoded() {
        if (!generator.toDecodedMap) return null;
        return clean(generator.toDecodedMap());
    }

    function getEncodedScopes(sources, getOrCreateName) {
        function variableToJson(variable) {
            return { kind: variable.kind, name: getOrCreateName(variable.name) };
        }
        function scopeToJson(scope) {
            const children = scope.children.map(scopeToJson);
            const variables = [...scope.variables];
            return {
                id: scope.id,
                kind: scope.kind,
                start: { line: scope.startLine - 1, column: scope.startColumn },
                end: {line: scope.endLine - 1, column: scope.endColumn },
                name: scope.name,
                children, variables};
        }
        function genScopeToJson(scope) {
          const children = scope.children.map(genScopeToJson);
          const variables = [...scope.variables];
          return {
            id: scope.id,
            start: { line: scope.startLine - 1, column: scope.startColumn },
            end: { line: scope.endLine - 1, column: scope.endColumn },
            children,
            variables,
          }
        }

        const source_scopes = [];
        for (const source of sources) {
            const scope = options.scopes.scopes.file_to_scope.get(source);
            source_scopes.push(scope ? scopeToJson(scope): null);
        }
        const gen_scope = options.scopes.gen_scopes.file_to_scope.get('gen');

        return {source_scopes, gen_scope: genScopeToJson(gen_scope)};
    }

    function encodeBinding(files, getOrCreateName, binding) {
        return {
            file: files.get(binding.file),
            line: binding.line - 1,
            col: binding.col,
            name: getOrCreateName(binding.name),
            expr: getOrCreateName(binding.expr),
        };
    }

    function getEncodedInlineTree(sources, getOrCreateName) {
        const files = buildIndexLookup(sources);

        function inlineInfoToJson(inlineInfo) {
            const children = inlineInfo.children.map(inlineInfoToJson);
            const bindings = inlineInfo.bindings.map(encodeBinding.bind(null, files, getOrCreateName));
            return {
                file: files.get(inlineInfo.file),
                line: inlineInfo.line - 1,
                col: inlineInfo.col,
                startLine: inlineInfo.start_line - 1,
                startCol: inlineInfo.start_col,
                endLine: inlineInfo.end_line - 1,
                endCol: inlineInfo.end_col,
                children, bindings};
        }

        return inline_tree.map(inlineInfoToJson);
    }

    function getEncodedBindings(sources, getOrCreateName) {
        const files = buildIndexLookup(sources);
        return bindings.map(encodeBinding.bind(null, files, getOrCreateName));
    }

    function getEncoded() {
        const json = clean(generator.toJSON());
        if (options.scopes) {
            // Create the helper for lookup and inserting into 'names'.
            const names = buildIndexLookup(json.names);
            const getOrCreateName = getOrCreate(names);

            // Plop the (unencoded!) scopes, inline info and bindings into the source map.
            const encoded_scopes = getEncodedScopes(json.sources, getOrCreateName);
            // const encoded_inline_infos = getEncodedInlineTree(json.sources, getOrCreateName);
            // const encoded_bindings = getEncodedBindings(json.sources, getOrCreateName);

            json.names = [...names.keys()];
            json.originalScopes = encoded_scopes.source_scopes;
            json.generatedScopes = encoded_scopes.gen_scope;
            // json.x_google_inlines = encoded_inline_infos;
            // json.x_google_bindings = encoded_bindings;
        }
        return json;
    }

    function destroy() {
        // @jridgewell/source-map's SourceMapConsumer does not need to be
        // manually freed.
        if (orig_map && orig_map.destroy) orig_map.destroy();
    }

    return {
        add,
        addVariable,
        getDecoded,
        getEncoded,
        destroy,
    };
}

export {
    SourceMap,
};
