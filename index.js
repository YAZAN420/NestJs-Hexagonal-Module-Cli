#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const inputName = process.argv[2];
if (!inputName) {
  process.exit(1);
}

const toKebab = (str) =>
  str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

const moduleName = toKebab(inputName);

function toSingular(word) {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('xes'))
    return word.slice(0, -2);
  if (word.endsWith('ss') || word.endsWith('us') || word.endsWith('is'))
    return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

const singularName = toSingular(moduleName);

const toPascal = (str) =>
  str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

const toCamel = (str) => {
  const pascal = toPascal(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

const toUpperSnake = (str) => str.replace(/-/g, '_').toUpperCase();

const tokens = {
  __moduleName__: moduleName, // e.g. order-items
  __singularName__: singularName, // e.g. order-item
  __ClassName__: toPascal(singularName), // e.g. OrderItem
  __ModuleClassName__: toPascal(moduleName), // e.g. OrderItems
  __camelName__: toCamel(singularName), // e.g. orderItem
  __moduleCamelName__: toCamel(moduleName), // e.g. orderItems
  __UpperClassName__: toUpperSnake(singularName), // e.g. ORDER_ITEM
};

const templatesDir = path.join(__dirname, 'templates');
const targetDir = path.join(process.cwd(), 'src', moduleName);

const requiredFolders = [
  'domain/enums',
  'domain/value-objects',
  'domain/events',
  'application/facades',
];

requiredFolders.forEach((folder) => {
  const fullPath = path.join(targetDir, folder);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

function transform(content) {
  let result = content;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.split(key).join(value);
  }
  return result;
}

function generate(templatePath, currentTargetDir) {
  if (!fs.existsSync(templatePath)) return;

  if (fs.statSync(templatePath).isDirectory()) {
    if (!fs.existsSync(currentTargetDir)) {
      fs.mkdirSync(currentTargetDir, { recursive: true });
    }
    fs.readdirSync(templatePath).forEach((file) => {
      const currentItemPath = path.join(templatePath, file);
      let newFileName = transform(file);

      if (fs.statSync(currentItemPath).isFile()) {
        newFileName = newFileName.replace(/\.txt$/, '');
        if (!newFileName.endsWith('.ts')) newFileName += '.ts';
      }

      generate(currentItemPath, path.join(currentTargetDir, newFileName));
    });
  } else {
    const content = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(currentTargetDir, transform(content), 'utf8');
  }
}

if (fs.existsSync(templatesDir)) {
  generate(templatesDir, targetDir);
} else {
  process.exit(1);
}

injectIntoAppModule();

function injectIntoAppModule() {
  const appModulePath = path.join(process.cwd(), 'src', 'app.module.ts');
  if (!fs.existsSync(appModulePath)) return;

  let appContent = fs.readFileSync(appModulePath, 'utf8');
  const moduleClass = `${tokens.__ModuleClassName__Module}`;

  if (appContent.includes(moduleClass)) {
    return;
  }

  const importStatement = `import { ${moduleClass} } from './${moduleName}/${moduleName}.module';\nimport { ${tokens.__ModuleClassName__InfrastructureModule} from './${moduleName}/infrastructure/${moduleName}-infrastructure.module';\n`;
  appContent = importStatement + appContent;

  const importsRegex = /imports\s*:\s*\[([\s\S]*?)\]/;
  const match = appContent.match(importsRegex);

  if (match) {
    const injection = `\n    ${moduleClass}.withInfrastructure(${tokens.__ModuleClassName__InfrastructureModule}.use()),`;
    const updatedImports = `imports: [${match[1].trimEnd()}${injection}\n  ]`;
    appContent = appContent.replace(importsRegex, updatedImports);
    fs.writeFileSync(appModulePath, appContent, 'utf8');
  } else {
    console.warn();
  }
}
