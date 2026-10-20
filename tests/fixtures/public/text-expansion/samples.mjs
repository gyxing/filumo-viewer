/** 全部为自建样本，无业务内容；大样本由调用方按需生成。 */
export const codeExpansionSamples = [
  {
    id: 'code-yaml',
    file: 'sample.yaml',
    format: 'yaml',
    language: 'yaml',
    text: 'name: 示例\nactive: true\nitems:\n  - first\n  - second\n',
  },
  {
    id: 'code-toml',
    file: 'sample.toml',
    format: 'toml',
    language: 'toml',
    text: 'title = "示例"\n[service]\nport = 8080\nenabled = true\n',
  },
  {
    id: 'code-powershell',
    file: 'sample.ps1',
    format: 'ps1',
    language: 'powershell',
    text: '$message = "示例"\nfunction Get-Message { return $message }\nWrite-Output (Get-Message)\n',
  },
  {
    id: 'code-batch',
    file: 'sample.cmd',
    format: 'cmd',
    language: 'batch',
    text: '@echo off\nset MESSAGE=example\nif defined MESSAGE echo %MESSAGE%\n',
  },
  {
    id: 'code-php',
    file: 'sample.php',
    format: 'php',
    language: 'php',
    text: '<section><?php $message = "示例"; echo htmlspecialchars($message); ?></section>\n',
  },
  {
    id: 'code-ruby',
    file: 'sample.rb',
    format: 'rb',
    language: 'ruby',
    text: 'def greet(name)\n  puts "Hello #{name}"\nend\ngreet("示例")\n',
  },
  {
    id: 'code-kotlin',
    file: 'sample.kt',
    format: 'kt',
    language: 'kotlin',
    text: 'fun main() {\n    val message: String = "示例"\n    println(message)\n}\n',
  },
  {
    id: 'code-swift',
    file: 'sample.swift',
    format: 'swift',
    language: 'swift',
    text: 'let message: String = "示例"\nfunc greet() {\n    print(message)\n}\n',
  },
  {
    id: 'code-lua',
    file: 'sample.lua',
    format: 'lua',
    language: 'lua',
    text: 'local message = "示例"\nfunction greet()\n  print(message)\nend\n',
  },
  {
    id: 'code-dockerfile',
    file: 'Dockerfile.dev',
    format: 'dockerfile',
    language: 'dockerfile',
    text: 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN echo "example"\nCMD ["node", "app.js"]\n',
  },
  {
    id: 'code-makefile',
    file: 'Makefile',
    format: 'mk',
    language: 'makefile',
    text: 'NAME := example\n.PHONY: hello\nhello:\n\t@echo $(NAME)\n',
  },
  {
    id: 'code-cmake',
    file: 'CMakeLists.txt',
    format: 'cmake',
    language: 'cmake',
    text: 'cmake_minimum_required(VERSION 3.20)\nproject(Example)\nadd_executable(example main.cpp)\n',
  },
  {
    id: 'code-graphql',
    file: 'sample.graphql',
    format: 'graphql',
    language: 'graphql',
    text: 'type Query {\n  user(id: ID!): User\n}\ntype User {\n  id: ID!\n  name: String!\n}\n',
  },
  {
    id: 'code-protobuf',
    file: 'sample.proto',
    format: 'proto',
    language: 'protobuf',
    text: 'syntax = "proto3";\nmessage User {\n  string name = 1;\n  bool enabled = 2;\n}\n',
  },
  {
    id: 'code-diff',
    file: 'sample.patch',
    format: 'patch',
    language: 'diff',
    text: '--- a/example.txt\n+++ b/example.txt\n@@ -1,2 +1,2 @@\n-old value\n+new value\n unchanged\n',
  },
  {
    id: 'code-dotenv',
    file: '.env.production',
    format: 'env',
    language: 'dotenv',
    text: '# 自建环境配置示例\nAPP_NAME=demo\nexport APP_MODE=production\nAPP_LABEL="中文 # 保留"\nAPP_URL="${BASE_URL}/api"\n',
  },
];

export const expansionSamples = [
  {
    id: 'csv-quoted',
    file: 'sample.csv',
    format: 'csv',
    text: '名称,说明,数量\r\n示例,"第一行\n第二行",2\r\n引号,"包含 ""引号""",3\r\n',
  },
  {
    id: 'tsv-basic',
    file: 'sample.tsv',
    format: 'tsv',
    text: '名称\t内容\n示例\t中文\n',
  },
  {
    id: 'jsonc-basic',
    file: 'sample.jsonc',
    format: 'jsonc',
    text: '{\n// 自建注释\n"url":"https://example.test/a",\n"same":1,"same":2,\n"items":[true,null,],\n}\n',
  },
  {
    id: 'jsonl-errors',
    file: 'sample.jsonl',
    format: 'jsonl',
    text: ' \r\n{"message":"第一条","value":9007199254740993123}\r\ninvalid\r\nnull\r\n',
  },
  {
    id: 'xml-namespaces',
    file: 'sample.xml',
    format: 'xml',
    text: '<?xml version="1.0" encoding="UTF-8"?>\n<root xmlns:p="urn:example">\n  <p:item id="a&amp;b">中文&amp;内容<![CDATA[<原文>]]></p:item>\n  <!-- 注释 -->\n  <empty/>\n</root>',
  },
  {
    id: 'code-typescript',
    file: 'sample.ts',
    format: 'ts',
    text: '// 多行语法样本\n/* 注释\n跨越两行 */\nconst message: string = `中文\n第二行`;\nconsole.log(message);\n',
  },
  {
    id: 'xml-colored',
    file: 'sample-colored.xml',
    format: 'xml',
    text:
      '<?xml version="1.0" encoding="UTF-8"?>\n<user xmlns:p="urn:example" id="001" enabled="true" note="&lt;b&gt;文本&lt;/b&gt;">\n  <p:name>张三</p:name>\n  <![CDATA[<原始内容>]]>\n  <!-- 说明 -->\n  <?display mode="read"?>\n  <long>' +
      '长文本'.repeat(100) +
      '</long>\n</user>',
  },
  {
    id: 'code-html',
    file: 'sample.html',
    format: 'html',
    text: '<!doctype html>\n<html><body>\n<a href="https://example.test/">原文 &amp; 标记</a>\n<script>window.untrustedCode = true;</script>\n</body></html>',
  },
  {
    id: 'code-less',
    file: 'sample.less',
    format: 'less',
    text: '@tone: #1677ff;\n.card {\n  color: @tone;\n  &:hover { opacity: .8; }\n}\n',
  },
  {
    id: 'code-scss',
    file: 'sample.scss',
    format: 'scss',
    text: '$tone: #1677ff;\n.card {\n  color: $tone;\n  &:hover { opacity: .8; }\n}\n',
  },
  {
    id: 'code-sass',
    file: 'sample.sass',
    format: 'sass',
    text: '$tone: #1677ff\n// 缩进样式\n.card\n  color: $tone\n  &:hover\n    opacity: .8\n',
  },
  ...codeExpansionSamples,
];
/** 宽表在使用时生成，避免提交大文件。 */
export function wideCsv(rows = 10000, columns = 120) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => `R${row}C${column}`).join(
      ',',
    ),
  ).join('\n');
}
