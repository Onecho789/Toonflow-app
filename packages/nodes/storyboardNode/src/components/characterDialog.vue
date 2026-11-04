<template>
  <el-dialog v-model="visible" title="角色库" width="min(760px, calc(100vw - 32px))" alignCenter appendToBody :closeOnClickModal="false" @open="load" @closed="onClosed">
    <div v-loading="loading" class="characterLibrary">
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" showIcon />
      <template v-else>
        <div class="libraryToolbar">
          <span class="libraryPath">保存在工作区 {{ libraryPath }}</span>
          <el-button size="small" type="primary" plain :icon="IconUserPlus" :disabled="busy" @click="addCharacter">新增角色</el-button>
        </div>
        <div v-if="!draft.length && !loading" class="libraryEmpty">
          <icon-mood-smile :size="36" stroke="1.25" aria-hidden="true" />
          <span>还没有角色，先新增一位主角吧</span>
        </div>
        <transition-group v-else tag="div" name="characterFade" class="characterList">
          <div v-for="character in draft" :key="character.id" class="characterCard">
            <div class="cardHeader">
              <el-input v-model="character.name" size="small" maxlength="100" placeholder="角色名称" aria-label="角色名称" :disabled="busy" />
              <el-button size="small" text type="danger" :icon="IconTrash" :disabled="busy" title="删除角色" aria-label="删除角色" @click="removeCharacter(character.id)" />
            </div>
            <el-input v-model="character.description" type="textarea" size="small" :autosize="{ minRows: 2, maxRows: 5 }" maxlength="5000" placeholder="外貌、性格、服装等设定，拆分镜头时会参考" aria-label="角色设定" :disabled="busy" />
            <div class="imageList">
              <div v-for="path in character.images" :key="path" class="imageItem">
                <characterImage :path="path" :alt="`${character.name || '角色'}设定图`" />
                <button class="removeImage" type="button" title="移除设定图" aria-label="移除设定图" :disabled="busy" @click="character.images = character.images.filter(item => item !== path)">
                  <icon-x :size="12" aria-hidden="true" />
                </button>
              </div>
              <button class="addImage" type="button" title="选择设定图" aria-label="选择设定图" :disabled="busy || character.images.length >= 20" @click="pickImages(character)">
                <icon-loader2 v-if="uploadingId === character.id" class="loadingIcon" :size="18" aria-hidden="true" />
                <icon-photo-plus v-else :size="18" aria-hidden="true" />
              </button>
            </div>
          </div>
        </transition-group>
      </template>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden aria-label="选择角色设定图" @change="uploadImages" />
    </div>
    <template #footer>
      <span v-if="saved" class="savedTip"><icon-circle-check :size="16" aria-hidden="true" />已保存</span>
      <el-button size="small" :disabled="saving" @click="visible = false">关闭</el-button>
      <el-button size="small" type="primary" :loading="saving" :disabled="busy || !!loadError || !dirty" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { ElAlert, ElButton, ElDialog, ElInput, ElLoading, ElMessage, ElMessageBox } from "element-plus";
import { IconCircleCheck, IconLoader2, IconMoodSmile, IconPhotoPlus, IconTrash, IconUserPlus, IconX } from "@tabler/icons-vue";
import { useNodeFiles } from "@toonflow/nodes-scaffold/runtime";
import { cloneCharacters, errorMessage, libraryPath, loadCharacterLibrary, saveCharacterLibrary, uploadCharacterImage, type Character } from "../characterLibrary";
import characterImage from "./characterImage.vue";

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [characters: Character[]] }>();
const vLoading = ElLoading.directive;
const { getWorkspaceFiles } = useNodeFiles();
const draft = ref<Character[]>([]);
const loading = ref(false);
const saving = ref(false);
const saved = ref(false);
const loadError = ref("");
const uploadingId = ref("");
const fileInput = ref<HTMLInputElement>();
const busy = computed(() => loading.value || saving.value || !!uploadingId.value);
let files: ReturnType<typeof getWorkspaceFiles> | undefined;
const state = shallowRef<Awaited<ReturnType<typeof loadCharacterLibrary>>>();
let pickingCharacter: Character | undefined;
const dirty = computed(() => !!state.value && JSON.stringify(draft.value) !== JSON.stringify(state.value.characters));

async function load() {
  loading.value = true;
  loadError.value = "";
  saved.value = false;
  try {
    // ACT: 打开弹窗时固定工作区，切换项目后需重新打开。
    files = getWorkspaceFiles();
    state.value = await loadCharacterLibrary(files);
    draft.value = cloneCharacters(state.value.characters);
  } catch (error) {
    loadError.value = errorMessage(error, "角色库读取失败");
  } finally {
    loading.value = false;
  }
}

function onClosed() {
  draft.value = [];
  state.value = undefined;
}

function addCharacter() {
  draft.value.push({ id: crypto.randomUUID(), name: "", description: "", images: [] });
  saved.value = false;
}

async function removeCharacter(id: string) {
  const character = draft.value.find(item => item.id === id);
  if (character && (character.name || character.description || character.images.length)) {
    const confirmed = await ElMessageBox.confirm(`删除「${character.name || "未命名角色"}」后，分镜中对它的绑定会失效。设定图文件仍保留在工作区。`, "删除角色", {
      confirmButtonText: "删除", cancelButtonText: "取消", type: "warning",
    }).then(() => true, () => false);
    if (!confirmed) return;
  }
  draft.value = draft.value.filter(item => item.id !== id);
}

function pickImages(character: Character) {
  pickingCharacter = character;
  fileInput.value?.click();
}

async function uploadImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = [...input.files ?? []];
  input.value = "";
  const character = pickingCharacter;
  if (!files || !character || !selected.length) return;
  uploadingId.value = character.id;
  try {
    for (const file of selected.slice(0, 20 - character.images.length)) character.images.push(await uploadCharacterImage(files, file));
  } catch (error) {
    ElMessage.error(errorMessage(error, "设定图上传失败"));
  } finally {
    uploadingId.value = "";
  }
}

async function save() {
  const library = state.value;
  if (!files || !library || busy.value) return;
  if (draft.value.some(item => !item.name.trim())) return ElMessage.warning("请为每个角色填写名称");
  const names = draft.value.map(item => item.name.trim());
  if (new Set(names).size !== names.length) return ElMessage.warning("角色名称不能重复，拆分镜头时按名称匹配角色");
  saving.value = true;
  try {
    const characters = draft.value.map(item => ({ ...item, name: item.name.trim(), description: item.description.trim() }));
    await saveCharacterLibrary(files, library, characters);
    draft.value = cloneCharacters(library.characters);
    saved.value = true;
    emit("saved", library.characters);
  } catch (error) {
    ElMessage.error(errorMessage(error, "角色库保存失败"));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.characterLibrary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  max-height: min(560px, calc(100dvh - 220px));
  overflow: auto;

  .libraryToolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    .libraryPath {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }

  .libraryEmpty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;

    svg { color: var(--el-color-primary); }
  }

  .characterList {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;

    .characterCard {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--ui-radius);
      background: var(--el-bg-color);
      transition: transform 120ms ease-out, border-color 120ms ease-out;

      &:hover {
        border-color: color-mix(in srgb, var(--el-color-primary) 40%, var(--el-border-color-lighter));
        transform: translateY(-1px);
      }

      .cardHeader {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .imageList {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        .imageItem, .addImage {
          position: relative;
          width: 56px;
          height: 56px;
        }

        .imageItem .removeImage {
          position: absolute;
          top: -6px;
          right: -6px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          padding: 0;
          border: 1px solid var(--el-border-color);
          border-radius: 50%;
          background: var(--el-bg-color);
          color: var(--el-text-color-regular);
          cursor: pointer;
          opacity: 0;
          transition: opacity 120ms ease-out;
        }

        .imageItem:hover .removeImage, .imageItem .removeImage:focus-visible { opacity: 1; }

        .addImage {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 1px dashed var(--el-border-color);
          border-radius: var(--ui-radius-small);
          background: transparent;
          color: var(--el-text-color-secondary);
          cursor: pointer;
          transition: color 120ms ease-out, border-color 120ms ease-out, background-color 120ms ease-out;

          &:hover:not(:disabled) {
            border-color: var(--el-color-primary);
            background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
            color: var(--el-color-primary);
          }

          &:disabled { cursor: not-allowed; opacity: 0.5; }

          .loadingIcon { animation: nodeLoading 1s linear infinite; }
        }
      }
    }
  }
}

.savedTip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 12px;
  color: var(--el-color-success);
  font-size: 12px;
}

.characterFade-enter-active { transition: opacity 120ms ease-out, transform 120ms ease-out; }
.characterFade-enter-from { opacity: 0; transform: translateY(4px); }

@keyframes nodeLoading {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .characterLibrary .characterList .characterCard,
  .characterLibrary .characterList .characterCard .imageList .addImage,
  .characterLibrary .characterList .characterCard .imageList .imageItem .removeImage,
  .characterFade-enter-active { transition: none; }
  .characterLibrary .characterList .characterCard:hover { transform: none; }
  .characterLibrary .characterList .characterCard .imageList .addImage .loadingIcon { animation: none; }
}
</style>
