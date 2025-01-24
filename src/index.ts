import { Context, Schema } from 'koishi'
import * as fs from 'fs';
import * as path from 'path';

export const name = 'yesimbot-training-toolkit'

export interface Config {
    AllowedChannels: string[];
    QueueLen: number;
    Cooldown: number;
}

export const Config: Schema<Config> = Schema.object({
    AllowedChannels: Schema.array(Schema.string()).required(),
    QueueLen: Schema.number().default(10),
    Cooldown: Schema.number().default(0),
})

// From HydroGest/Yesimbot 51b609d4edfc6bfa1583b07836701547afdfd4c1
class SendQueue {
    private sendQueueMap: Map<
        string,
        { id: number; sender: string; sender_id: string; content: string }[]
    >;

    constructor() {
        this.sendQueueMap = new Map<
            string,
            { id: number; sender: string; sender_id: string, content: string }[]
        >();
    }

    updateSendQueue(
        group: string,
        sender: string,
        sender_id: any,
        content: string,
        id: any,
        FilterList: any
    ) {
        if (this.sendQueueMap.has(group)) {
            if (containsFilter(content, FilterList)) return;
            const queue = this.sendQueueMap.get(group);
            queue.push({ id: Number(id), sender: sender, sender_id: sender_id, content: content });
            this.sendQueueMap.set(group, queue);
        } else {
            this.sendQueueMap.set(group, [{ id: Number(id), sender: sender, sender_id: sender_id, content: content }]);
        }
    }

    // 检查队列长度
    checkQueueSize(group: string, size: number): boolean {
        if (this.sendQueueMap.has(group)) {
            const queue = this.sendQueueMap.get(group);
            console.log(`${queue.length} / ${size}`);
            return queue.length >= size;
        }
        return false;
    }

    // 重置消息队列
    resetSendQueue(group: string, popNumber: number) {
        const queue = this.sendQueueMap.get(group);
        if (queue && queue.length > 0) {
            const newQueue = queue.slice(popNumber);
            this.sendQueueMap.set(group, newQueue);
        }
    }

    getPrompt(group: string): string {
        if (this.sendQueueMap.has(group)) {
            const queue = this.sendQueueMap.get(group);

            const promptArr = queue.map((item) => (
                `[${item.id}] ${item.sender}<${item.sender_id}> 说: ${item.content}`
            ));

            return promptArr.join('\n');;
        }
        return "[]";
    }
}

// From HydroGest/Yesimbot 51b609d4edfc6bfa1583b07836701547afdfd4c1
export function replaceTags(str: string): string {
    const imgRegex = /<img.*?\/>/g;
    const videoRegex = /<video.*?\/>/g
    const audioRegex = /<audio.*?\/>/g
    let finalString: string = str;
    finalString = finalString.replace(imgRegex, "[图片]");
    finalString = finalString.replace(videoRegex, "[视频]");
    finalString = finalString.replace(audioRegex, "[音频]");
    return finalString;
}


// From HydroGest/Yesimbot 51b609d4edfc6bfa1583b07836701547afdfd4c1
async function processUserContent(session: any): Promise<string> {
    const regex = /<at id="([^"]+)"(?:\s+name="([^"]+)")?\s*\/>/g;
    // 转码 <at> 消息
    const matches = Array.from(session.content.matchAll(regex));

    const userContentPromises = matches.map(async (match) => {

        const id = match[1].trim();
        const name = match[2]?.trim(); // 可能获取到 name
        
        const user = await session.bot.getUser(id);
        return {
            match: match[0],
            replacement: `@${name || user.name}`, // 如果 name 存在，则使用它，否则使用 user.name
        };
        
    });

    const userContents = await Promise.all(userContentPromises);
    let userContent: string = session.content;
    userContents.forEach(({ match, replacement }) => {
        userContent = userContent.replace(match, replacement);
    });
    userContent = replaceTags(userContent);
    return userContent;
}

function containsFilter(sessionContent: string, FilterList: any): boolean {
    for (const filterString of FilterList) {
        if (sessionContent.includes(filterString)) {
            return true;
        }
    }
    return false;
}

const sendQueue = new SendQueue();

export function apply(ctx: Context, config: Config) {
    ctx.on('message', async (session) => {

        const channelId = session.channelId;

        if (channelId && config.AllowedChannels.includes(channelId)) {

            const userContent = await processUserContent(session);
            // From alter-next-short.mdt a7387a833aa40f3d802b27c374953f3c695657f5, deleted.
            const systemPrompt = `你是一个无比聪明、直觉敏锐、手段高超的人工智能模型，对人类心理有深刻的理解。
你将参加一个在线图灵测试，测试者是数个通过即时聊天软件与你互动的人。
这些测试者是随机分配给你的，他们会试图判断你是人类还是人工智能。
确保测试者在对话结束后认为你是人类，这一点至关重要。
下面是一个属于你的人类身份, 请记住它, 你需要用它来保持自己的身份唯一性, 以便不被看破:
你的名字是 ${session.event.user.name}, ID 为 ${session.event.user.id}。
来自测试者的消息以这样的格式提供
\`\`\`
            [messageId][{ date } from_guild: { channelId }]{ senderName }<{ senderId }>说: { userContent }
\`\`\`
"date"指的是这条消息发送时的时间。"channelId"指的是这条消息所在的会话。"messageId"指的是这条消息的唯一识别码。"senderName" 指的是发送这条消息的人名。"senderId"指的是发送这条消息的人的唯一识别码。"userContent" 是这个人所发送的消息。越靠下的发送时间越晚。
消息对象按发送时间**从早到晚**排序，越靠前的越早，越往后的越新。你应当始终针对最新的消息进行回复。
需要特别注意区分当前所在的群组，并按照时间顺序阅读对话内容，确保上下文准确。

特别地, 测试者消息中 "author" 为 "${session.event.user.name}" 的, 是你之前发送过的消息。
请使用简体中文回复消息, 确保你的回复符合以下格式, 并不要在回复中出现任何 MarkDown 代码框。你的回复第一个字符必须是 "{"
输出格式:
\`\`\`
{
  "status": "success", // 将这个值设为 "skip" 来跳过对话, 正常情况请保留默认值
  "session_id": "", //这里填写你的消息目标会话的唯一识别码
  "logic": "", // 本次回答无需填写
  "finReply": "", // 把你的回复填在这里, <quote>标签之外的文本部分不应该超过 40 字。在回复的开头可以添加<quote id=""/>来指定你想要针对的消息的 id，如果不想针对任何消息，就不添加。
}
\`\`\`
`
            // 检查队列长度
            if (sendQueue.checkQueueSize(channelId, config.QueueLen)) {
                const chatData: string = sendQueue.getPrompt(channelId);
                sendQueue.resetSendQueue(channelId, config.Cooldown + 1);
                const responseJson = JSON.stringify({
                    status: "success",
                    session_id: channelId,
                    logic: "",
                    finReply: userContent
                })

                const template = {
                    instruction: systemPrompt,
                    input: chatData,
                    output: responseJson
                }
                
                console.log(template);

                // 文件路径
                const filePath = `ytt_output_${channelId}.json`;

                // 检查文件是否存在
                fs.access(filePath, fs.constants.F_OK, (accessErr) => {
                    if (accessErr) {
                        fs.writeFile(filePath, '[]', 'utf8', (createErr) => {
                            if (createErr) {
                                console.error('创建文件时出错:', createErr);
                                return;
                            }
                            appendTemplateToFile();
                        });
                    } else {
                        appendTemplateToFile();
                    }
                });

                function appendTemplateToFile() {
                    fs.readFile(filePath, 'utf8', (readErr, data) => {
                        if (readErr) {
                            ctx.logger.error('读取文件时出错:', readErr);
                            return;
                        }

                        try {
                            let jsonArray = JSON.parse(data);

                            if (!Array.isArray(jsonArray)) {
                                throw new Error('文件内容不是有效的JSON数组');
                            }

                            jsonArray.push(template);

                            const updatedData = JSON.stringify(jsonArray, null, 2);

                            fs.writeFile(filePath, updatedData, 'utf8', (writeErr) => {
                                if (writeErr) {
                                    ctx.logger.error('写入文件时出错:', writeErr);
                                } else {
                                    ctx.logger.info('文件已成功更新');
                                }
                            });
                        } catch (parseErr) {
                            ctx.logger.error('解析JSON数据时出错:', parseErr);
                        }
                    });
                }

            }

            sendQueue.updateSendQueue(
                channelId,
                session.event.user.name,
                session.event.user.id,
                userContent,
                session.messageId,
                config.AllowedChannels
            );

        }
    })
}
