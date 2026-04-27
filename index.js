#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const moduleName = process.argv[2];
if (!moduleName) {
  console.error('Error: Please provide a module name! (e.g., my-hex products)');
  process.exit(1);
}

let singularName = moduleName;
if (moduleName.endsWith('ies')) singularName = moduleName.slice(0, -3) + 'y';
else if (moduleName.endsWith('s')) singularName = moduleName.slice(0, -1);

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ClassName = capitalize(singularName);
const ModuleClassName = capitalize(moduleName);

const templatesDir = path.join(__dirname, 'templates');
const targetDir = path.join(process.cwd(), 'src', moduleName);

console.log(`Generating Hexagonal module: ${moduleName}...`);

const requiredFolders = [
  'application/commands',
  'application/queries',
  'application/ports',
  'domain/enums',
  'domain/value-objects',
  'domain/factories',
  'infrastructure/persistence/in-memory/entities',
  'infrastructure/persistence/in-memory/repositories',
  'infrastructure/persistence/mongoose/schemas',
  'infrastructure/persistence/mongoose/repositories',
  'presentation/dto',
];

requiredFolders.forEach((folder) => {
  const fullPath = path.join(targetDir, folder);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

function transform(content) {
  return content
    .replace(/__ClassName__/g, ClassName)
    .replace(/__singularName__/g, singularName)
    .replace(/__moduleName__/g, moduleName)
    .replace(/__ModuleClassName__/g, ModuleClassName);
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
    let content = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(currentTargetDir, transform(content), 'utf8');
  }
}

if (fs.existsSync(templatesDir)) {
  generate(templatesDir, targetDir);
  console.log('✅ Templates generated successfully!');
} else {
  console.error('❌ Error: templates folder not found.');
  process.exit(1);
}

const appModulePath = path.join(process.cwd(), 'src', 'app.module.ts');
if (fs.existsSync(appModulePath)) {
  let appContent = fs.readFileSync(appModulePath, 'utf8');

  if (!appContent.includes(`${ModuleClassName}Module.withInfrastructure`)) {
    const importsToAdd = `import { ${ModuleClassName}Module } from './${moduleName}/${moduleName}.module';\nimport { ${ModuleClassName}InfrastructureModule } from './${moduleName}/infrastructure/${moduleName}-infrastructure.module';\n`;

    const lastImportMatch = [...appContent.matchAll(/^import .*;/gm)].pop();
    const insertPos = lastImportMatch
      ? lastImportMatch.index + lastImportMatch[0].length
      : 0;

    appContent =
      appContent.slice(0, insertPos) +
      '\n' +
      importsToAdd +
      appContent.slice(insertPos);

    const registerStart = appContent.indexOf('static register');
    if (registerStart !== -1) {
      const importsArrayStart = appContent.indexOf('imports: [', registerStart);

      if (importsArrayStart !== -1) {
        let brackets = 0;
        let closePos = -1;
        for (
          let i = importsArrayStart + 'imports: ['.length;
          i < appContent.length;
          i++
        ) {
          if (appContent[i] === '[') brackets++;
          else if (appContent[i] === ']') {
            if (brackets === 0) {
              closePos = i;
              break;
            }
            brackets--;
          }
        }

        if (closePos !== -1) {
          const injectionCode = `\n        ${ModuleClassName}Module.withInfrastructure(\n          ${ModuleClassName}InfrastructureModule.use(options.driver),\n        ),`;
          appContent =
            appContent.slice(0, closePos) +
            injectionCode +
            '\n      ' +
            appContent.slice(closePos);
        }
      }
    }

    fs.writeFileSync(appModulePath, appContent, 'utf8');
    console.log(
      `✅ Injected ${ModuleClassName} dynamically into app.module.ts!`,
    );
  } else {
    console.log(
      `⚠️ ${ModuleClassName} is already in app.module.ts. Skipped injection.`,
    );
  }
}
