import axios from "axios";
import { ref, shallowRef } from "vue";

export type TicketCategory = "bug" | "feature" | "plugin" | "model" | "account" | "other";
export type TicketStatus = "open" | "processing" | "resolved" | "closed";
export type Ticket = { id: number; category: TicketCategory; title: string; status: TicketStatus; clientInfo: string; unread: boolean; messageCount: number; createdAt: string; updatedAt: string };
export type TicketMessage = { id: number; role: "user" | "admin"; content: string; createdAt: string };
type TicketPage = { list: Ticket[]; total: number; page: number; size: number; unreadCount: number; supportEmail: string };

export const feedbackClient = axios.create({ baseURL: "/api/cloud/tickets", headers: { "x-toonflow-workspace": "1" }, timeout: 20000 });
export const tickets = shallowRef<Ticket[]>([]);
export const ticketTotal = ref(0);
export const ticketUnread = ref(0);
export const supportEmail = ref("");

export function feedbackError(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : String(error);
}

// ACT: 不做推送，打开应用和进入反馈页时拉取一次；客服回复要等下次拉取才显示红点。
export async function loadTickets(page = 1, size = 20) {
  const data = (await feedbackClient.get<{ data: TicketPage }>("/list", { params: { page, size } })).data.data;
  tickets.value = data.list;
  ticketTotal.value = data.total;
  ticketUnread.value = data.unreadCount;
  supportEmail.value = data.supportEmail;
  return data;
}
