/**
 * 生物学分析提示词库 —— 预置专业分析模板，让 InfiniSynapse Agent 更智能。
 *
 * 每个模板包含：
 * - id：唯一标识
 * - label：UI 显示名
 * - prompt：发给 Agent 的完整指令（含生物学知识框架 + 分析要求）
 */

export interface BioTemplate {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export const BIO_TEMPLATES: BioTemplate[] = [
  {
    id: "comprehensive",
    label: "全面解读",
    description: "差异分析 + 生物学意义 + 文献对比 + 后续实验",
    prompt: `请作为分子生物学专家，对以上 qPCR 数据进行全面的生物学解读：

## 分析框架

### 1. 数据质量评估
- 检查各基因的 Ct 值是否在合理范围（通常 15-35）
- 评估内参基因的稳定性（Ct 值标准差应 < 0.5）
- 标记可能的异常数据点

### 2. 差异表达分析
- 计算并报告每个基因在各组间的 fold change（倍数变化）
- 标注显著上调（FC > 2）和显著下调（FC < 0.5）的基因
- 结合误差棒（Stdev）评估差异的可靠性

### 3. 生物学意义解读
- 对每个差异基因，说明其已知的生物学功能
- 推测可能的调控通路（如凋亡、增殖、代谢、免疫等）
- 分析多个基因同时变化时可能指向的通路激活/抑制
- 注明哪些推断有文献支持，哪些是合理推测

### 4. 与文献的对比
- 引用该领域经典文献的发现作为参照
- 如果结果与文献一致，说明意义
- 如果结果与文献不一致，分析可能原因

### 5. 后续实验建议
- 建议补充验证实验（如 Western Blot、ELISA、免疫荧光）
- 建议扩大样本量或增加重复
- 建议检测相关通路的其他标志物`,
  },
  {
    id: "pathway",
    label: "通路分析",
    description: "聚焦信号通路富集和调控网络",
    prompt: `请作为信号通路分析专家，对以上 qPCR 数据进行通路层面的解读：

## 分析要求

### 1. 通路富集推断
- 根据差异表达的基因组合，推断可能激活/抑制的信号通路
- 重点关注以下常见通路：
  - PI3K/AKT/mTOR 通路（细胞增殖、存活）
  - MAPK/ERK 通路（细胞分化、增殖）
  - Wnt/β-catenin 通路（干细胞调控、发育）
  - JAK-STAT 通路（免疫、炎症）
  - NF-κB 通路（炎症、免疫）
  - p53 通路（细胞周期、凋亡）
  - TGF-β 通路（上皮间质转化、纤维化）
  - 自噬通路（LC3, Beclin-1, p62）

### 2. 基因调控网络
- 构建"基因→通路→表型"的调控逻辑链
- 分析上游调控因子和下游效应分子的协调性
- 如果内参基因变化，分析其对结论的影响

### 3. 表型预测
- 基于通路变化，预测可能的细胞表型变化（增殖/凋亡/分化/迁移等）
- 如果是疾病相关数据，分析与疾病表型的关联

### 4. 药物靶点提示（如适用）
- 如果发现特定通路异常，建议可能的药物靶点
- 注明推断的不确定性`,
  },
  {
    id: "drug-resistance",
    label: "耐药分析",
    description: "耐药机制 + 标志物筛选",
    prompt: `请作为肿瘤药理学专家，假设以上数据可能来自药物处理组 vs 对照组，重点分析耐药相关变化：

## 分析要求

### 1. 耐药标志物筛查
- 检查以下经典耐药相关基因的表达变化：
  - 药物外排泵：MDR1/ABCB1, MRP1/ABCC1, BCRP/ABCG2
  - 凋亡抵抗：BCL-2, BCL-XL, MCL-1, Survivin
  - DNA 损伤修复：ERCC1, BRCA1, PARP1
  - EMT/干细胞：VIM, CDH1/N-cadherin, CD44, ALDH1
  - 信号通路代偿：EGFR, HER2, MET, IGF1R
- 报告哪些标志物显著变化，可能指示耐药机制

### 2. 耐药机制推断
- 基于变化的基因组合，推断可能的耐药机制：
  - 药物外排增加
  - 凋亡通路抑制
  - 信号通路重配（bypass/替代激活）
  - EMT 转化
  - 干细胞特性获得
  - DNA 修复增强

### 3. 克服耐药的策略建议
- 建议联合用药方案（基于机制）
- 建议生物标志物用于患者分层
- 注明推断的不确定性`,
  },
  {
    id: "apoptosis",
    label: "凋亡分析",
    description: "细胞凋亡通路 + 死亡机制",
    prompt: `请作为细胞死亡研究专家，对以上 qPCR 数据重点进行凋亡通路分析：

## 分析要求

### 1. 凋亡通路判定
- 检查以下凋亡相关基因的表达模式：
  - 内源性通路（线粒体）：BAX, BAK, BCL-2, BCL-XL, MCL-1, Cytochrome c, APAF-1
  - 外源性通路（死亡受体）：FAS, FASL, TNF-α, TRAIL, Caspase-8, FLIP
  - 执行通路：Caspase-3, Caspase-6, Caspase-7, PARP
  - 自噬相关：LC3, Beclin-1, p62/SQSTM1, ATG5
  - DNA 损伤应答：p53, p21, ATM, ATR, CHK1, CHK2
- 判断是内源性、外源性还是混合型凋亡

### 2. 促凋亡 vs 抗凋亡平衡
- 计算 BAX/BCL-2 比值变化趋势
- 分析促凋亡和抗凋亡基因的整体平衡
- 评估自噬与凋亡的交叉对话

### 3. 凋亡程度估算
- 基于基因表达变化的幅度，定性估计凋亡程度（轻度/中度/重度）
- 结合误差棒评估结论可靠性

### 4. 干预建议
- 建议可增强或抑制凋亡的干预靶点
- 建议用流式细胞术 Annexin V/PI 双染验证`,
  },
  {
    id: "stem-cell",
    label: "干细胞特性",
    description: "干性标志物 + 分化状态",
    prompt: `请作为干细胞生物学专家，对以上 qPCR 数据重点分析干细胞特性变化：

## 分析要求

### 1. 干性标志物评估
- 检查以下干细胞相关标志物的表达：
  - 多能性转录因子：OCT4/POU5F1, SOX2, NANOG, KLF4, c-MYC
  - 表面标志物：CD44, CD133/PROM1, CD24, ALDH1, THY1/CD90
  - EMT 标志物：VIM, CDH1/E-cadherin, SNAI1, TWIST, ZEB1
  - 干细胞维持通路：Wnt（β-catenin, AXIN2）, Notch（HES1）, Hedgehog（GLI1, PTCH1）

### 2. 分化状态推断
- 根据干性标志物的整体变化趋势，判断细胞是否：
  - 去分化（获得干性）
  - 分化（丧失干性）
  - EMT 转化（上皮→间质）
  - MET 转化（间质→上皮）

### 3. 干性指数估算
- 综合多个标志物，定性评估"干性指数"变化
- 分析哪些转录因子的变化起主导作用

### 4. 功能意义
- 如果是肿瘤数据，分析与肿瘤干细胞（CSC）特性的关联
- 建议补充成球实验、极限稀释法等功能验证`,
  },
  {
    id: "custom",
    label: "自定义",
    description: "自由输入分析需求",
    prompt: "",
  },
];

/** 内置示例 qPCR 数据（让评委不用准备文件也能体验） */
export const SAMPLE_DATA = `| Gene | Group_Name | Repeat1 | Repeat2 | Repeat3 | Average | Stdev | Method |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAPDH | Control | 1.01 | 0.98 | 1.01 | 1.00 | 0.015 | Reference-normalized |
| GAPDH | Treatment | 1.02 | 0.99 | 0.99 | 1.00 | 0.015 | Reference-normalized |
| TP53 | Control | 1.05 | 0.95 | 1.00 | 1.00 | 0.05 | Reference-normalized |
| TP53 | Treatment | 3.20 | 3.10 | 3.30 | 3.20 | 0.10 | Reference-normalized |
| BCL2 | Control | 1.02 | 0.98 | 1.00 | 1.00 | 0.02 | Reference-normalized |
| BCL2 | Treatment | 0.35 | 0.40 | 0.38 | 0.38 | 0.025 | Reference-normalized |
| BAX | Control | 1.00 | 1.02 | 0.98 | 1.00 | 0.02 | Reference-normalized |
| BAX | Treatment | 2.85 | 2.90 | 2.80 | 2.85 | 0.05 | Reference-normalized |
| MYC | Control | 1.01 | 1.00 | 0.99 | 1.00 | 0.01 | Reference-normalized |
| MYC | Treatment | 0.42 | 0.45 | 0.43 | 0.43 | 0.015 | Reference-normalized |
| CDK4 | Control | 1.00 | 1.03 | 0.97 | 1.00 | 0.03 | Reference-normalized |
| CDK4 | Treatment | 0.50 | 0.48 | 0.52 | 0.50 | 0.02 | Reference-normalized |
| VIM | Control | 1.01 | 0.99 | 1.00 | 1.00 | 0.01 | Reference-normalized |
| VIM | Treatment | 2.10 | 2.05 | 2.15 | 2.10 | 0.05 | Reference-normalized |
| CDH1 | Control | 1.00 | 1.02 | 0.98 | 1.00 | 0.02 | Reference-normalized |
| CDH1 | Treatment | 0.55 | 0.50 | 0.60 | 0.55 | 0.05 | Reference-normalized |`;

export const SAMPLE_GENES = ["TP53", "BCL2", "BAX", "MYC", "CDK4", "VIM", "CDH1"];
