<template>
  <div class="feedbackPage">
    <el-scrollbar class="pageScroll">
      <div class="pageBody">
        <header class="pageHeader">
          <span class="titleIcon" aria-hidden="true"><icon-message-report :size="22" /></span>
          <div class="titleText">
            <h1>问题反馈</h1>
            <p>遇到问题或有好点子都可以告诉我们，每一条都会认真看并在这里回复你</p>
          </div>
        </header>

        <div v-if="!cloudAccount" class="loginCard" role="status">
          <icon-lock :size="28" aria-hidden="true" />
          <strong>{{ cloudAccountLoading ? "正在读取账号…" : "登录麦麦云账号后即可提交反馈" }}</strong>
          <span>请在左下角「设置 → 账号」中登录，反馈与回复会跟随账号保存</span>
        </div>
        <section v-else class="categorySection" aria-labelledby="categoryTitle">
          <h2 id="categoryTitle" class="sectionTitle">想反馈什么？</h2>
          <div class="categoryGrid">
            <button v-for="item in categories" :key="item.value" type="button" class="categoryCard" :class="item.value" @click="openCreate(item.value)">
              <span class="categoryIcon" aria-hidden="true"><component :is="item.icon" :size="22" /></span>
              <span class="categoryText">
                <strong>{{ item.label }}</strong>
                <span>{{ item.description }}</span>
              </span>
              <icon-chevron-right class="categoryArrow" :size="16" aria-hidden="true" />
            </button>
          </div>
          <p v-if="supportEmail" class="mailHint">
            <icon-mail :size="15" aria-hidden="true" />
            需要发送截图、录屏或日志文件？请发邮件到
            <button type="button" class="mailLink" :title="`复制 ${supportEmail}`" @click="copyEmail">{{ supportEmail }}<icon-copy :size="13" aria-hidden="true" /></button>
            ，并在邮件里注明工单编号。
          </p>
        </section>

        <section v-if="cloudAccount" class="ticketSection" aria-labelledby="ticketTitle">
          <div class="sectionHeader">
            <h2 id="ticketTitle" class="sectionTitle">我的反馈<span v-if="ticketTotal" class="sectionCount">{{ ticketTotal }}</span></h2>
            <el-button text :icon="IconRefresh" :loading="loading" @click="refresh">刷新</el-button>
          </div>
          <div v-loading="loading && !tickets.length" class="ticketList">
            <p v-if="listError" class="listError" role="alert">{{ listError }}</p>
            <div v-else-if="!tickets.length && !loading" class="ticketEmpty">
              <icon-messages :size="32" aria-hidden="true" />
              <strong>还没有提交过反馈</strong>
              <span>选择上面的类型开始第一条反馈吧</span>
            </div>
            <button v-for="item in tickets" :key="item.id" type="button" class="ticketItem" @click="openDetail(item)">
              <span class="ticketBadge" :class="item.category" aria-hidden="true"><component :is="categoryOf(item.category).icon" :size="18" /></span>
              <span class="ticketMain">
                <span class="ticketTitle">
                  <i v-if="item.unread" class="unreadDot" aria-label="有新回复" />
                  {{ item.title }}
                </span>
                <span class="ticketMeta">#{{ item.id }} · {{ categoryOf(item.category).label }} · {{ item.messageCount }} 条消息 · {{ formatTime(item.updatedAt) }}</span>
              </span>
              <span class="statusTag" :class="item.status">{{ statusNames[item.status] }}</span>
            </button>
          </div>
          <el-pagination
            v-if="ticketTotal > pageSize"
            v-model:currentPage="page"
            class="ticketPager"
            layout="prev, pager, next"
            :pageSize="pageSize"
            :total="ticketTotal"
            @currentChange="refresh" />
        </section>
      </div>
    </el-scrollbar>

    <el-dialog v-model="createVisible" class="feedbackDialog" width="560px" alignCenter :closeOnClickModal="false" @closed="resetForm">
      <template #header>
        <div class="dialogTitle">
          <span class="ticketBadge" :class="form.category" aria-hidden="true"><component :is="categoryOf(form.category).icon" :size="18" /></span>
          <span>提交反馈</span>
        </div>
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" labelPosition="top" @submit.prevent>
        <el-form-item label="反馈类型" prop="category">
          <el-select v-model="form.category">
            <el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="80" showWordLimit :placeholder="categoryOf(form.category).titleHint" />
        </el-form-item>
        <el-form-item label="详细描述" prop="content">
          <el-input v-model="form.content" type="textarea" :autosize="{ minRows: 6, maxRows: 14 }" maxlength="5000" showWordLimit :placeholder="categoryOf(form.category).contentHint" />
        </el-form-item>
      </el-form>
      <p class="dialogHint">
        会自动附带客户端版本与系统信息，方便我们排查。<template v-if="supportEmail">截图等文件请发到 {{ supportEmail }}。</template>
      </p>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :icon="IconSend" :loading="submitting" @click="submit">提交</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" class="ticketDrawer" size="min(560px, 100%)" @closed="detail = undefined">
      <template #header>
        <div v-if="detail" class="drawerTitle">
          <strong>{{ detail.ticket.title }}</strong>
          <span>#{{ detail.ticket.id }} · {{ categoryOf(detail.ticket.category).label }} · <span class="statusTag" :class="detail.ticket.status">{{ statusNames[detail.ticket.status] }}</span></span>
        </div>
      </template>
      <div v-loading="detailLoading" class="messageList">
        <template v-if="detail">
          <article v-for="item in detail.messages" :key="item.id" class="messageItem" :class="item.role">
            <span class="messageAvatar" aria-hidden="true">
              <icon-headset v-if="item.role === 'admin'" :size="16" />
              <template v-else>我</template>
            </span>
            <div class="messageBubble">
              <div class="messageHead">{{ item.role === "admin" ? "麦麦客服" : "我" }} · {{ formatTime(item.createdAt) }}</div>
              <p>{{ item.content }}</p>
            </div>
          </article>
        </template>
      </div>
      <template v-if="detail" #footer>
        <div v-if="detail.ticket.status === 'closed'" class="closedHint"><icon-lock :size="15" aria-hidden="true" />工单已关闭，如有新问题请重新提交</div>
        <div v-else class="replyBox">
          <el-input v-model="reply" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" maxlength="5000" placeholder="补充说明或回复客服" aria-label="回复内容" />
          <div class="replyActions">
            <el-button text :icon="IconCircleCheck" :loading="closing" @click="closeTicket">问题已解决，关闭工单</el-button>
            <el-button type="primary" :icon="IconSend" :loading="replying" :disabled="!reply.trim()" @click="sendReply">发送</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, vLoading, type FormInstance, type FormRules } from "element-plus";
import { IconBug, IconBulb, IconCircleCheck, IconCreditCard, IconHelpCircle, IconPuzzle, IconRefresh, IconSend, IconSparkles } from "@tabler/icons-vue";
import { actualPlatform } from "@/lib/platform";
import { cloudAccount, cloudAccountLoading } from "@/stores/cloudAccount";
import { feedbackClient, feedbackError, loadTickets, supportEmail, ticketTotal, tickets, type Ticket, type TicketCategory, type TicketMessage, type TicketStatus } from "@/stores/feedback";

const categories = [
  { value: "bug", label: "Bug 问题", description: "功能报错、闪退、结果不对", icon: IconBug, titleHint: "例如：视频工作台生成后结果不显示", contentHint: "请描述操作步骤、预期结果和实际结果，有报错提示的话一并贴上" },
  { value: "feature", label: "功能优化建议", description: "体验不顺手、想要新功能", icon: IconBulb, titleHint: "例如：希望生图工作台支持批量生成", contentHint: "说说你想在什么场景下使用、希望它怎么工作" },
  { value: "plugin", label: "插件问题与建议", description: "插件市场、节点、工具插件", icon: IconPuzzle, titleHint: "例如：某插件安装后画布里找不到", contentHint: "请写明插件名称和版本，以及遇到的问题或建议" },
  { value: "model", label: "模型与生成效果", description: "出图出视频质量、速度、失败", icon: IconSparkles, titleHint: "例如：某模型生成视频经常失败", contentHint: "请写明模型名称、提示词和参数，以及大概的时间" },
  { value: "account", label: "账号与计费", description: "登录、余额、充值、扣费", icon: IconCreditCard, titleHint: "例如：充值后余额没有到账", contentHint: "请写明发生时间、金额或订单号，不要填写密码" },
  { value: "other", label: "其他", description: "以上都不是，随便聊聊", icon: IconHelpCircle, titleHint: "简单概括一下你想说的", contentHint: "想说什么都可以" },
] as const satisfies readonly { value: TicketCategory; [key: string]: unknown }[];
const statusNames: Record<TicketStatus, string> = { open: "待处理", processing: "处理中", resolved: "已解决", closed: "已关闭" };
const pageSize = 20;
const page = ref(1);
const loading = ref(false);
const listError = ref("");
const createVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<{ category: TicketCategory; title: string; content: string }>({ category: "bug", title: "", content: "" });
const rules: FormRules = {
  title: [{ required: true, whitespace: true, message: "请填写标题", trigger: "blur" }],
  content: [{ required: true, whitespace: true, message: "请填写详细描述", trigger: "blur" }],
};
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<{ ticket: Ticket; messages: TicketMessage[] }>();
const reply = ref("");
const replying = ref(false);
const closing = ref(false);

const categoryOf = (value: TicketCategory) => categories.find(item => item.value === value) ?? categories[categories.length - 1]!;
const formatTime = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

async function refresh() {
  loading.value = true;
  listError.value = "";
  try {
    await loadTickets(page.value, pageSize);
  } catch (error) {
    listError.value = feedbackError(error);
  } finally {
    loading.value = false;
  }
}

watch(() => cloudAccount.value?.id, id => {
  if (id) void refresh();
}, { immediate: true });

function openCreate(category: TicketCategory) {
  form.category = category;
  createVisible.value = true;
}

function resetForm() {
  Object.assign(form, { title: "", content: "" });
  formRef.value?.clearValidate();
}

function clientInfo() {
  const platform = actualPlatform.isDesktop ? "桌面端" : actualPlatform.isMobile ? "移动端" : "浏览器";
  return `麦麦工坊 v${import.meta.env.appVersion} · ${platform} · ${navigator.userAgent}`.slice(0, 500);
}

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  submitting.value = true;
  try {
    const ticket = (await feedbackClient.post<{ data: Ticket }>("/create", { ...form, clientInfo: clientInfo() })).data.data;
    ElMessage.success("已提交，我们会尽快回复");
    createVisible.value = false;
    page.value = 1;
    await refresh();
    void openDetail(ticket);
  } catch (error) {
    ElMessage.error(feedbackError(error));
  } finally {
    submitting.value = false;
  }
}

async function loadDetail(id: number) {
  detailLoading.value = true;
  try {
    detail.value = (await feedbackClient.get<{ data: { ticket: Ticket; messages: TicketMessage[] } }>("/detail", { params: { id } })).data.data;
  } catch (error) {
    ElMessage.error(feedbackError(error));
  } finally {
    detailLoading.value = false;
  }
}

async function openDetail(item: Ticket) {
  reply.value = "";
  detailVisible.value = true;
  await loadDetail(item.id);
  // 打开详情后云端已清除未读，重新拉取同步菜单红点。
  if (item.unread) void refresh();
}

async function sendReply() {
  const id = detail.value!.ticket.id;
  replying.value = true;
  try {
    await feedbackClient.post("/reply", { id, content: reply.value.trim() });
    reply.value = "";
    await loadDetail(id);
    void refresh();
  } catch (error) {
    ElMessage.error(feedbackError(error));
  } finally {
    replying.value = false;
  }
}

async function closeTicket() {
  try {
    await ElMessageBox.confirm("关闭后不能再回复，有新问题可以重新提交。", "关闭工单", { confirmButtonText: "关闭工单", cancelButtonText: "取消" });
  } catch {
    return;
  }
  const id = detail.value!.ticket.id;
  closing.value = true;
  try {
    await feedbackClient.post("/close", { id });
    await loadDetail(id);
    void refresh();
  } catch (error) {
    ElMessage.error(feedbackError(error));
  } finally {
    closing.value = false;
  }
}

async function copyEmail() {
  try {
    await navigator.clipboard.writeText(supportEmail.value);
    ElMessage.success("邮箱已复制");
  } catch {
    ElMessage.warning("复制失败，请手动选择邮箱");
  }
}
</script>

<style lang="scss" scoped>
.feedbackPage {
  height: 100%;
  min-height: 0;

  .pageScroll { height: 100%; }

  .pageBody {
    display: flex;
    flex-direction: column;
    gap: 28px;
    max-width: 960px;
    margin: 0 auto;
    padding: 28px 24px 40px;
  }

  .pageHeader {
    display: flex;
    align-items: center;
    gap: 12px;

    .titleIcon {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
      color: #fff;
      box-shadow: 0 6px 16px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    }

    .titleText {
      h1 { margin: 0; font-size: 20px; font-weight: 600; }
      p { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 13px; }
    }
  }

  .sectionTitle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;

    .sectionCount {
      padding: 0 8px;
      border-radius: 999px;
      background: var(--el-fill-color);
      color: var(--el-text-color-secondary);
      font-size: 12px;
      font-weight: 500;
      line-height: 20px;
    }
  }

  .loginCard {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    border: 1px dashed var(--el-border-color);
    border-radius: calc(var(--ui-radius) * 1.5);
    background: radial-gradient(circle at 50% 0%, var(--el-color-primary-light-9), transparent 70%);
    color: var(--el-text-color-secondary);
    font-size: 13px;

    svg { color: var(--el-color-primary); }
    strong { color: var(--el-text-color-primary); font-size: 15px; font-weight: 600; }
  }

  .categorySection {
    .categoryGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }

    .categoryCard {
      --tone: var(--el-color-primary);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: calc(var(--ui-radius) * 1.5);
      background: var(--el-bg-color-overlay);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      box-shadow: var(--el-box-shadow-lighter);
      transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;

      &.bug { --tone: var(--el-color-danger); }
      &.feature { --tone: var(--el-color-warning); }
      &.plugin { --tone: var(--el-color-primary); }
      &.model { --tone: #a855f7; }
      &.account { --tone: var(--el-color-success); }
      &.other { --tone: var(--el-text-color-secondary); }

      .categoryIcon {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--tone) 14%, transparent);
        color: var(--tone);
      }

      .categoryText {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 2px;
        min-width: 0;

        strong { font-size: 14px; font-weight: 600; }
        span { color: var(--el-text-color-secondary); font-size: 12px; }
      }

      .categoryArrow { color: var(--el-text-color-placeholder); transition: transform 0.15s, color 0.15s; }

      &:hover {
        border-color: color-mix(in srgb, var(--tone) 45%, transparent);
        box-shadow: var(--el-box-shadow-light);
        transform: translateY(-2px);

        .categoryArrow { color: var(--tone); transform: translateX(2px); }
      }

      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

      @media (prefers-reduced-motion: reduce) { transition: none; &:hover { transform: none; } }
    }

    .mailHint {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin: 14px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 12px;

      .mailLink {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--el-color-primary);
        font: inherit;
        cursor: pointer;

        &:hover { text-decoration: underline; }
        &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
      }
    }
  }

  .ticketSection {
    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .sectionTitle { margin: 0; }
    }

    .ticketList {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 120px;
      margin-top: 12px;
    }

    .listError {
      margin: 0;
      padding: 16px;
      border-radius: var(--ui-radius);
      background: var(--el-color-danger-light-9);
      color: var(--el-color-danger);
      font-size: 13px;
    }

    .ticketEmpty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 36px 16px;
      border: 1px dashed var(--el-border-color);
      border-radius: calc(var(--ui-radius) * 1.5);
      color: var(--el-text-color-secondary);
      font-size: 12px;

      svg { color: var(--el-text-color-placeholder); }
      strong { color: var(--el-text-color-regular); font-size: 14px; font-weight: 500; }
    }

    .ticketItem {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: calc(var(--ui-radius) * 1.5);
      background: var(--el-bg-color-overlay);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;

      &:hover { border-color: var(--el-color-primary-light-5); background: var(--el-fill-color-lighter); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

      .ticketMain {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 3px;
        min-width: 0;

        .ticketTitle {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow: hidden;
          font-size: 14px;
          font-weight: 500;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ticketMeta { color: var(--el-text-color-secondary); font-size: 12px; }
      }
    }

    .ticketPager { justify-content: center; margin-top: 16px; }
  }

  .unreadDot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-danger);
  }

  .ticketBadge {
    --tone: var(--el-color-primary);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tone) 14%, transparent);
    color: var(--tone);

    &.bug { --tone: var(--el-color-danger); }
    &.feature { --tone: var(--el-color-warning); }
    &.model { --tone: #a855f7; }
    &.account { --tone: var(--el-color-success); }
    &.other { --tone: var(--el-text-color-secondary); }
  }

  .statusTag {
    flex-shrink: 0;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 22px;

    &.open { background: var(--el-color-warning-light-9); color: var(--el-color-warning); }
    &.processing { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
    &.resolved { background: var(--el-color-success-light-9); color: var(--el-color-success); }
    &.closed { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
  }

  .dialogTitle {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
  }

  .dialogHint { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }

  .drawerTitle {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    color: var(--el-text-color-primary);

    strong { overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
    > span { display: flex; align-items: center; gap: 4px; color: var(--el-text-color-secondary); font-size: 12px; }
  }

  .messageList {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 120px;

    .messageItem {
      display: flex;
      gap: 10px;

      .messageAvatar {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--el-color-primary);
        color: #fff;
        font-size: 12px;
      }

      .messageBubble {
        max-width: 82%;

        .messageHead { margin-bottom: 4px; color: var(--el-text-color-secondary); font-size: 12px; }

        p {
          margin: 0;
          padding: 10px 12px;
          border-radius: 4px 12px 12px;
          background: var(--el-fill-color-light);
          font-size: 13px;
          line-height: 1.7;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
      }

      &.user {
        flex-direction: row-reverse;

        .messageBubble {
          .messageHead { text-align: end; }
          p { border-radius: 12px 4px 12px 12px; background: var(--el-color-primary-light-9); }
        }
      }

      &.admin .messageAvatar { background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3)); }
    }
  }

  .closedHint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  .replyBox {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .replyActions { display: flex; align-items: center; justify-content: space-between; }
  }
}
</style>
