import * as tmp from 'tmp';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { stripIndent } from 'common-tags';

import { foldFile } from './class-fold';


const transformJavascript = (content, beforeTransforms = [], afterTransforms = []) => {
  // Print error diagnostics.
  const checkDiagnostics = (diagnostics: ts.Diagnostic[]) => {
    if (diagnostics && diagnostics.length > 0) {
      console.error(ts.formatDiagnostics(diagnostics, {
        getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
        getNewLine: () => ts.sys.newLine,
        getCanonicalFileName: (f: string) => f
      }));
    }
  }

  // TODO: find a way to not have to write content onto disk, use custom compilerHost.
  const tmpFile = tmp.fileSync({ postfix: '.js' }).name;
  fs.writeFileSync(tmpFile, content);

  // We're not actually writing anything to disk, but still need to define an outDir
  // because otherwise TS will fail to emit JS since it would overwrite the original.
  const outDir = __dirname;
  // Store file in memory instead of writing to disk.
  const emittedFileContents = {};
  const writeCallback: ts.WriteFileCallback = (fileName: string, data: string) => {
    emittedFileContents[path.relative(outDir, fileName)] = data;
  };

  const options: ts.CompilerOptions = {
    allowJs: true,
    newLine: ts.NewLineKind.LineFeed,
    outDir
  };

  const compilerHost = ts.createCompilerHost(options);
  const program = ts.createProgram([tmpFile], options, compilerHost);

  const { emitSkipped, diagnostics } = program.emit(
    undefined, writeCallback, undefined, undefined,
    { before: beforeTransforms, after: afterTransforms });
  checkDiagnostics(diagnostics);

  const transformedContent = emittedFileContents[path.basename(tmpFile)];

  if (emitSkipped || !transformedContent) {
    throw new Error('TS compilation was not successfull.');
  }

  return transformedContent;
}



describe('class-fold', () => {
  it('folds static properties into class', () => {
    const staticProperty = 'Clazz.prop = 1;';
    const input = `
      var Clazz = (function () { function Clazz() { } return Clazz; }());
      ${staticProperty}
    `;
    const output = `
      var Clazz = (function () { function Clazz() { } ${staticProperty}return Clazz; }());
      
    `;

    const tmpFile = tmp.fileSync({ postfix: '.js' }).name;
    fs.writeFileSync(tmpFile, input);

    expect(foldFile(tmpFile, 'spec')).toEqual(output);
  });

  it('folds static properties into class [transform]', () => {
    const staticProperty = 'Clazz.prop = 1;';
    const input = stripIndent`
      var Clazz = (function () { function Clazz() { } return Clazz; }());
      ${staticProperty}
    `;
    const output = stripIndent`
      var Clazz = (function () { function Clazz() { } ${staticProperty}return Clazz; }());
      
    `;

    expect(transformJavascript(input, [transformer]).trim()).toEqual(input);
  });
});

export function transformer(context: ts.TransformationContext):
  ts.Transformer<ts.SourceFile> {
  const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
    switch (node.kind) {
      case ts.SyntaxKind.Decorator:
        // drop on the floor;
        return null as any;
      default:
        return ts.visitEachChild(node, visitor, context);
    }
  };

  const transformer: ts.Transformer<ts.SourceFile> = (sf: ts.SourceFile) =>
    ts.visitNode(sf, visitor);

  return transformer;
}
