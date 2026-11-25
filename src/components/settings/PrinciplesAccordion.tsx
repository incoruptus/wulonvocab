"use client";

import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/misc";

const sections = [
  {
    title: "数据与同步",
    subtitle: "哪些内容跟着你走，哪些只留在这台设备",
    content: (
      <>
        <h4>本地优先</h4>
        <p>词库、学习记录与设置首先保存在当前浏览器的 IndexedDB。应用不要求账号，也不把日常学习放在远程数据库里；同步是你主动开启的可选能力。</p>
        <h4>会同步的内容</h4>
        <ul>
          <li>词库与词条：名称、描述、标签、字段表、导出设置、学习三态、学习配置、个人题库、每日统计、SRS 与顽固词搁置。</li>
          <li>命名保存视图：随所属词库保存；当前排序、筛选、分区选择与折叠状态仍是本机临时状态。</li>
          <li>复习事件：评分、撤销补偿与清空标记使用稳定 ID，跨设备去重；保留最近 180 天且最多 5,000 条。</li>
          <li>通用学习设置、数据源的非凭据配置、本地词典元数据与导出预设。</li>
        </ul>
        <h4>只留本机的内容</h4>
        <ul>
          <li>API Key 与自定义 HTTP 请求头：独立保管，只在发出请求时注入，不进入主词库、同步包或备份。换机后需要重新填写。</li>
          <li>深浅模式、强调色与最近使用的词库。</li>
          <li>AI 管家聊天、检索与题目缓存、公共题库分片缓存、本地词典行数据、设备身份、配对码、GitHub Token 与安全快照。</li>
        </ul>
        <h4>合并而不是覆盖</h4>
        <p>单边修改取修改方；双方修改同一处时按时间戳与设备号裁决，重要冲突可在预览里翻转。词条主体使用最后写入胜出，SRS 优先采用较晚的复习结果并尊重显式重置。每日统计逐项取较大值，避免重复累计。删除写入墓碑，防止旧设备把内容带回来。</p>
        <h4>三种同步方式</h4>
        <p>同步包适合偶尔换机；Gist 自动档用配对码派生密钥加密上传；PeerJS 扫码直传走 WebRTC，不经过应用服务器。启动、切回前台、恢复联网、学习会话结束与重要设置改动都会按策略触发同步。</p>
        <p>备份用于整库恢复，不包含凭据。清空所有数据会同时清理本机凭据与可重建缓存。</p>
      </>
    ),
  },
  {
    title: "学习与题型",
    subtitle: "新词怎么引入，复习为什么在这个时候出现",
    content: (
      <>
        <h4>新词三步流</h4>
        <ol>
          <li>教学卡展示词形、音标、释义与例句，不评分。</li>
          <li>「有印象 / 没印象」只选择验证路径，不直接代表记忆强度。</li>
          <li>有印象先做四选一再认验证，正确记 Hard，错误记 Again 并回教学卡；回忆成功才可记 Good，费力记 Hard，答不出记 Again 并揭晓。</li>
        </ol>
        <p>新词 Good 依次在 30 分钟、1 天、3 天后复习，再交给 FSRS。初始短步骤完成前不会提前毕业。</p>
        <h4>复习调度</h4>
        <p>复习使用 FSRS-6，根据到期时间、记忆稳固度与你的评级安排下一次见面。忘记会在本轮继续回炉，没有静默次数上限；按 X 可以显式「先放下」，记 Again 但本轮不再回炉。预览与实际评分共享同一时刻，避免显示的间隔和真正写入的不一致。</p>
        <h4>三个题型大类</h4>
        <ul>
          <li>熟悉度自评：先回忆，再翻面对照评级。</li>
          <li>选择题：限时四选一，包括看词选英文释义、看英文释义选英文词、看中文释义选英文词、看词选中文释义。</li>
          <li>Cloze：从真实或经校验的例句中挖空，可作为独立学习模式；稳定后可加入拼写。</li>
        </ul>
        <p>三种模式可以单独使用，也可以选择「混搭」。混搭按你设定的比例平滑轮转三大题，再在选择题内部按四个子型的权重出题；新词验证规则不变，缺数据的题只回退该题。</p>
        <h4>选择题规则</h4>
        <p>每题恰好一个正确答案，最多两个真正易混项，其余为对照项。四个子型可分别设置 10 / 15 / 20 / 25 / 30 秒，默认依次为看词选英文释义 30 秒、看英文释义选词 20 秒、后两型各 15 秒；页面隐藏或打开弹层时暂停。超时记 Again 并揭晓答案，错题必须停留。正确最高 Good，猜对记 Hard。隐藏词头的题目在判定前不显示答案，也不朗读。</p>
        <h4>计划、目标与顽固词</h4>
        <p>规则档先安排复习，时间不足时先减少新词，不删除积压，也不改到期时间。弱词优先最多占当前复习队列的 20%，只改变顺序。每日有效提取目标有 20 / 40 / 60 三档，连续学习每周自动宽恕一次。反复忘记达到词库阈值后可搁置 7 / 30 天、改卡或降级重学；搁置期间仍保留原 SRS。</p>
        <h4>掌握证据</h4>
        <p>R(30) 是当前记忆强度下对 30 天后仍记得的概率估计，不是永久掌握。再认、回忆与产出按复习日志分别派生，同一会话每层只取首次有效评分；这些证据不写回 SRS，也不改变词条状态。</p>
      </>
    ),
  },
  {
    title: "字段、导入与导出",
    subtitle: "词库如何成长，又如何变成可打印的内容",
    content: (
      <>
        <h4>动态字段</h4>
        <p>字段表决定词条有哪些内容。文本、列表、标签、音标、义项、例句、键值、词形、表格、图片、引用、评分与分隔线可以自由组合。重命名字段会迁移现有数据；删除字段不会立刻丢内容，数据会进入「未定义字段」，可以再次提升。</p>
        <h4>添加与导入</h4>
        <p>词库内「添加并匹配」适合单个新词，查词典后先预览差异，再由你决定应用哪些字段。整批词表走统一导入页，支持 JSON、CSV、NDJSON、ECDICT、Word、PDF 与图片。所有入口共用识别、归一化、字段推断、去重与冲突预览管线，重复导入保持幂等。</p>
        <h4>保存视图</h4>
        <p>保存视图记录命名后的排序、筛选、分组与折叠快照，不复制词条。每本词库最多保留 20 个，删除后通过墓碑同步。临时视图状态只服务当前设备，不会覆盖另一台设备的当前操作。</p>
        <h4>导出与打印</h4>
        <p>导出设置与词库内容解耦，可保存多套命名方案。预览、测量与打印共用同一套布局参数，支持 A4 / A5 / B5 / 16 开 / 32 开、多栏、封面、索引、页脚与四套主题，可输出矢量 PDF、图片 PDF 或 PNG ZIP。</p>
        <p>「跟随列表排序」读取当前设备的临时视图。跨设备打印时应先选择明确的排序或保存视图，不依赖另一台设备屏幕上恰好停着的状态。</p>
      </>
    ),
  },
  {
    title: "公共选择题题库",
    subtitle: "社区共同维护题目，应用按需读取",
    content: (
      <>
        <h4>分工</h4>
        <p>公共 GitHub 仓库维护题目源文件、Issues、Pull Requests、举报、纠错与审核记录；公共 Gist 是匿名只读分发镜像。应用按词哈希找到 64 个分片中的一个，按需下载并在本机缓存 24 小时，不会一次拉取整个题库。</p>
        <h4>题目准入</h4>
        <p>题目通常由 AI 生成自然英文释义与真正的易混词，但生成结果不等于可直接使用。应用会再次检查恰好四个选项、唯一答案、目标词一致性、1–2 个易混项及其差异说明；英文释义不能直接泄露目标词。不合格的题目会被跳过。</p>
        <h4>供给顺序</h4>
        <p>每个词库可以选择公共只读层、个人可维护层，或两层并用。实际供给顺序是所选个人层、所选公共层、内置编辑题、显式开启的 AI，最后使用词条已有字段组成离线题。两层并用且个人题命中时优先使用个人版本。内置示例十词另附 40 道编辑题，可在没有题库时直接练习。</p>
        <p>个人题保存在所属词库中，使用稳定 ID 同步合并，删除写入墓碑。公共文件可以一键从个人题生成，只包含题目、状态与署名，不携带学习记录。网络短暂失败时不同子型共享冷却，不连续等待多次超时；AI 或题库不可用时自动降级。</p>
        <h4>举报、纠错与贡献</h4>
        <p>举报会立即在本机隔离该题。贡献包展示完整题目、词性、难度、署名与你选择的 CC0 或 CC-BY-4.0 许可，只包含题目，不包含词库、学习记录、设备 ID、API Key 或个人笔记。</p>
        <p>当前已实现匿名读取、举报隔离与贡献包下载。公共仓库创建和 GitHub OAuth Application 注册仍需外部准备，完成后才开放应用内直接上传；待上传贡献包与举报记录的跨端同步也尚未实现。</p>
      </>
    ),
  },
];

export function PrinciplesAccordion() {
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="t-h-16 text-gray-1000">原理说明</h2>
        <p className="t-label-12 mt-1 text-gray-700">从数据边界到学习规则，展开查看 WulonVocab 的工作方式。</p>
      </div>
      <div className="divide-y divide-gray-300 overflow-hidden rounded-xl bg-background-100 shadow-geist-border">
        {sections.map((section, index) => (
          <details key={section.title} name="wulonvocab-principles" className="group" open={index === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3.5 marker:hidden">
              <span className="t-mono-12 grid size-6 shrink-0 place-items-center rounded-md bg-gray-100 text-gray-700">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="t-label-14 block font-medium text-gray-1000">{section.title}</span>
                <span className="t-label-12 mt-0.5 block text-gray-700">{section.subtitle}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-gray-700 transition-transform group-open:rotate-180" />
            </summary>
            <div className="principle-content border-t border-gray-300 px-4 py-5 text-[14px] leading-7 text-gray-800 sm:px-6 sm:py-6">
              {section.content}
            </div>
          </details>
        ))}
      </div>
      <style jsx>{`
        .principle-content h4 { margin: 1.75rem 0 .625rem; font-size: .9375rem; line-height: 1.55; font-weight: 650; letter-spacing: .01em; color: var(--ds-gray-1000); }
        .principle-content h4:first-child { margin-top: 0; }
        .principle-content p { margin: 0; line-height: 1.85; }
        .principle-content p + p { margin-top: .9rem; }
        .principle-content ul, .principle-content ol { margin: .625rem 0 1rem; padding-left: 1.375rem; }
        .principle-content ul { list-style: disc; }
        .principle-content ol { list-style: decimal; }
        .principle-content li { padding-left: .25rem; line-height: 1.8; }
        .principle-content li + li { margin-top: .625rem; }
        .principle-content h4 + ul, .principle-content h4 + ol { margin-top: .5rem; }
      `}</style>
    </Card>
  );
}
