# koishi-plugin-yesimbot-training-toolkit

[![npm](https://img.shields.io/npm/v/koishi-plugin-yesimbot-training-toolkit?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-yesimbot-training-toolkit)

使用 yesimbot 格式从聊群收集聊天记录并生成模型微调数据集。

## Usage

第一步：将 Bot 放入你要收集的群，在该群内最好不要有 Bot 自身的发言，避免污染数据。

第二步：填写配置

第三步：启动，慢慢等待，直到你认为数据收集充分。

第四步：从 Koishi 目录寻找 `ytt_output_{群号}.json`，这是你的 alpaca 格式的数据集。

第五步：使用 LLaMA-Factory 或 unsloth 进行模型微调。