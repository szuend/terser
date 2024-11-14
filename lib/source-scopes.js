import {
  AST_Accessor,
  AST_Arrow,
  AST_ConciseMethod,
  AST_Defun,
  AST_DefClass,
  AST_Function,
  AST_Scope,
  AST_SymbolFunarg,
  AST_Toplevel,
  AST_VarDef,
  walk,
  walk_abort,
  AST_PrivateMethod} from "./ast.js";

class SourceVariable {
  constructor(kind, name) {
    this.kind = kind;
    this.name = name;
  }
}

function comparePositions(l, r) {
  return l.line - r.line || l.col - r.col;
}

class SourceScope {
  constructor(kind, startLine, startColumn, endLine, endColumn, name) {
    this.kind = kind;
    this.startLine = startLine;
    this.startColumn = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
    this.name = name;
    this.children = [];
    this.variables = [];
    this.id = -1;
  }

  start() {
    return { line: this.startLine, col: this.startColumn };
  }

  end() {
    return { line: this.endLine, col: this.endColumn };
  }

  findScopeForPoint(line, col) {
    let current = this;
    let container ;
    const pos = {line, col};
    while (current) {
      container = current;
      // Find out if any child has the scope.
      current = null;
      for (const child of container.children) {
        if (comparePositions(child.start(), pos) <= 0 &&
            comparePositions(pos, child.end()) <= 0) {
          current = child;
          break;
        }
      }
    }
    return container;
  }
}

class SourceFileScopes {
  constructor() {
    this.file_to_scope = new Map();
  }

  add_scope(file, scope) {
    let source_scope = this.file_to_scope.get(file);
    if (!source_scope) {
      this.file_to_scope.set(file, scope);
      return;
    }

    const container = source_scope.findScopeForPoint(scope.startLine, scope.startColumn);
    // TODO(jaro-sevcik) Assert that the child is after all the existing children.
    container.children.push(scope);
  }

  add_variable(kind, file, line, col, name) {
    let source_scope = this.file_to_scope.get(file);
    if (!source_scope) {
      // TODO(jaro-sevcik) Warn, somehow?
      return;
    }
    const container = source_scope.findScopeForPoint(line, col);
    // TODO(jaro-sevcik) Hoist var, function to the function/top scope.
    // TODO(jaro-sevcik) Handle duplicates.
    // container.variables.push(new SourceVariable(kind, name));
    container.variables.add(name);
  }
}

// Builds a scope tree for the given top level node.
export function processScopes(toplevel) {
  let scopes = new SourceFileScopes();
  let gen_scopes = new SourceFileScopes();
  let id = 0;
  walk(toplevel, node => {
    // Handle scopes.
    let scope = null;
    if (node instanceof AST_Scope) {
      if (node.start === null || node.end === null || node.start.file !== node.end.file) {
        return walk_abort;
      }
      let kind = null;
      if (node instanceof AST_Toplevel) {
        kind = "toplevel";
      } else if (node instanceof AST_Defun) {
        // Function definition
        kind = "function";
      } else if (node instanceof AST_Function) {
        // Function expression
        kind = "function";
      } else if (node instanceof AST_Arrow) {
        // Arrow function
        kind = "arrow";
      } else if (node instanceof AST_DefClass) {
        kind = "class";
      } else if (node instanceof AST_Accessor) {

      } else {
        kind = "block";

        // TODO(jaro-sevcik) Figure out methods.
        // Other scopes to look at:
        // AST_ClassStaticBlock
        // AST_Class // maybe not
        // AST_ObjectGetter
        // AST_ObjectSetter
        // AST_PrivateGetter
        // AST_PrivateSetter
        // AST_ConciseMethod (AST_PrivateMethod)
      }
      if (kind !== null) {
        scope = new SourceScope(kind, node.start.line, node.start.col, node.end.line, node.end.col,
          node.name?.name);
      }
    } else if (node instanceof AST_PrivateMethod) {
      // scope = new SourceScope("method", node.start.line, node.start.col, node.end.line, node.end.col,
      //   node.key ? `#${node.key?.name}` : null);
    } else if (node instanceof AST_ConciseMethod) {
      // scope = new SourceScope("method", node.start.line, node.start.col, node.end.line, node.end.col,
      //   node.name?.name);
    } else if (node.is_block_scope()) {
      const {block_scope: {start, end}} = node;
      scope = new SourceScope("block", start.line, start.col, end.line, end.col);
    }

    if (scope) {
      scope.id = id++;
      const n = node.is_block_scope() ? node.block_scope : node;
      const gen_scope = new SourceScope('gen', n.gen_start.line, n.gen_start.column, n.gen_end.line, n.gen_end.column);
      gen_scope.id = scope.id;
      scopes.add_scope(node.start.file, scope);
      gen_scopes.add_scope('gen', gen_scope);

      for (const [name, def] of n.variables) {
        if (name === 'arguments') continue;
        scope.variables.push(name);
        gen_scope.variables.push(def.mangled_name ?? null);
      }
    }

    // Handle variable definitions.
    // TODO(jaro-sevcik) Switch to using AST_Symbol.
    if (node instanceof AST_VarDef) {
      // scopes.add_variable("local", node.start.file, node.start.line, node.start.col, node.name?.name);
    } else if (node instanceof AST_SymbolFunarg) {
      // scopes.add_variable("arg", node.start.file, node.start.line, node.start.col, node.name);
    }
    // TODO(jaro-sevcik) Also handle function and class definitions here.
  });

  return {scopes, gen_scopes};
}
