import ts from 'typescript';

function pluginPropertyAncestor(node) {
  let current = node;
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      const name = current.name.getText().replace(/^['"]|['"]$/g, '');
      if (name === 'plugins') return true;
    }
    current = current.parent;
  }
  return false;
}

function analyzeModule(text, fileName, moduleName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const identifiers = new Set();
  let integration = false;
  let legacy = false;

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text === moduleName) {
        const clause = node.importClause;
        if (clause?.name) identifiers.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) identifiers.add(clause.namedBindings.name.text);
      }
      if (node.moduleSpecifier.text === 'tailwindcss') legacy = true;
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText() === 'require'
      && ts.isStringLiteral(node.initializer.arguments[0])) {
      if (node.initializer.arguments[0].text === moduleName && ts.isIdentifier(node.name)) identifiers.add(node.name.text);
      if (node.initializer.arguments[0].text === 'tailwindcss') legacy = true;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && identifiers.has(node.expression.text) && pluginPropertyAncestor(node)) integration = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { integration, legacy };
}

export function detectTailwindBuildIntegration(files) {
  const evidence = [];
  let legacy = false;
  for (const file of files) {
    const moduleName = file.kind === 'vite' ? '@tailwindcss/vite' : '@tailwindcss/postcss';
    const analyzed = analyzeModule(file.text, file.path, moduleName);
    if (analyzed.integration) evidence.push({ path: file.path, kind: file.kind, module: moduleName });
    legacy ||= analyzed.legacy;

    if (file.kind === 'postcss') {
      const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const visit = (node) => {
        if (ts.isPropertyAssignment(node)) {
          const name = node.name.getText().replace(/^['"]|['"]$/g, '');
          if (name === '@tailwindcss/postcss' && pluginPropertyAncestor(node)) {
            evidence.push({ path: file.path, kind: file.kind, module: '@tailwindcss/postcss' });
          }
          if (name === 'tailwindcss' && pluginPropertyAncestor(node)) legacy = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  const unique = [...new Map(evidence.map((item) => [`${item.path}:${item.module}`, item])).values()]
    .sort((a, b) => a.path.localeCompare(b.path));
  return { integrated: unique.length > 0, evidence: unique, legacy };
}
