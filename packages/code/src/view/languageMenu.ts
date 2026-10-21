import type { CapabilityOption } from '@filumo/dom';
import type { CodeLanguage } from '../options';
import { codeLanguages } from '../fileTypes';

// 前端、脚本、通用编程、配置、构建、接口和补丁分组，沿用纯菜单分隔线。
const languageGroups: readonly (readonly CodeLanguage[])[] = [
  ['javascript', 'typescript', 'html', 'css', 'less', 'scss', 'sass'],
  ['bash', 'powershell', 'batch', 'python', 'ruby', 'lua'],
  ['java', 'kotlin', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'php'],
  ['yaml', 'toml', 'dotenv'],
  ['dockerfile', 'makefile', 'cmake'],
  ['sql', 'graphql', 'protobuf'],
  ['diff'],
  ['plaintext'],
];

/** 菜单只生成轻量选项，选择语言后才由会话启动相应高亮任务。 */
export function codeLanguageOptions(en: boolean): readonly CapabilityOption[] {
  return languageGroups.flatMap((group, groupIndex) =>
    group.map((value, index) => ({
      value,
      label: value === 'plaintext' && en ? 'Plain text' : codeLanguages[value],
      dividerBefore: groupIndex > 0 && index === 0,
    })),
  );
}
