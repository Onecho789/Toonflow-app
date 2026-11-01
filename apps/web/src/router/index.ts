import { createRouter, createWebHashHistory } from "vue-router";
import { useHelloStore } from "@/stores/hello";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/hello",
      beforeEnter: async () => await useHelloStore().load() ? { path: "/home", replace: true } : true,
      component: () => import("@/pages/hello/index.vue"),
    },
    {
      // 首页、项目和工作台共用左侧菜单；根路径仍先进入欢迎页。
      path: "/",
      redirect: "/hello",
      component: () => import("@/components/appLayout.vue"),
      children: [
        { path: "home", component: () => import("@/pages/home/index.vue") },
        { path: "projects", component: () => import("@/pages/projects/index.vue") },
        { path: "imageStudio", component: () => import("@/pages/imageStudio/index.vue") },
        { path: "videoStudio", component: () => import("@/pages/videoStudio/index.vue") },
        { path: "guide", component: () => import("@/pages/guide/index.vue") },
        { path: "feedback", component: () => import("@/pages/feedback/index.vue") },
      ],
    },
    {
      path: "/canvas",
      redirect: "/workspace",
    },
    {
      path: "/workspace",
      component: () => import("@/pages/workspace/index.vue"),
    },
  ],
});
export default router;
