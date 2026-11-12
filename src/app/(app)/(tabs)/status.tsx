import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/logo';
import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { ReportModal } from '@/components/ui/report-modal';
import { Screen } from '@/components/ui/screen';
import { useSession } from '@/features/auth/session';
import { useContactsMap } from '@/features/chats/hooks';
import { pickChatImageFromCamera, pickChatImageFromLibrary } from '@/features/chats/media';
import { useFriendRequests } from '@/features/friends/hooks';
import { getStatusMediaUrl } from '@/features/status/api';
import {
  useCreateImageStatus,
  useCreateTextStatus,
  useDeleteStatus,
  useMarkStatusViewed,
  useReactToStatus,
  useReplyToStatus,
  useStatuses,
  useStatusesRealtime,
} from '@/features/status/hooks';
import { formatListTime, formatMessageTime } from '@/lib/format';
import { saveImageToGallery } from '@/lib/save-media';
import type { StatusAuthorGroup, StatusItem } from '@/lib/types';
import { useKeyboardHeight } from '@/lib/use-keyboard';
import { useTheme } from '@/theme';

const STATUS_COLORS = [
  '#DC2626', // Akatsuki Crimson
  '#EA580C', // Naruto Sage Orange
  '#0A0A0E', // Ninja Obsidian
  '#0284C7', // Chidori Cyan
  '#991B1B', // Sharingan Burgundy
  '#D97706', // Kurama Chakra Amber
  '#1E1B2E', // Akatsuki Cloak Slate
];

export default function StatusScreen() {
  const { colors } = useTheme();
  const { userId, profile } = useSession();

  const statusesQuery = useStatuses(userId);
  const contactsMapQuery = useContactsMap(userId);
  const friendsQuery = useFriendRequests(userId);
  useStatusesRealtime(Boolean(userId));

  const authorSummary = useMemo(
    () =>
      profile
        ? {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_path: profile.avatar_path,
          }
        : null,
    [profile],
  );

  const createText = useCreateTextStatus(userId ?? '', authorSummary);
  const createImage = useCreateImageStatus(userId ?? '', authorSummary);
  const markViewed = useMarkStatusViewed(userId ?? '');
  const removeStatus = useDeleteStatus();
  const reactStatus = useReactToStatus(userId ?? '');
  const replyStatus = useReplyToStatus(userId ?? '');

  const [refreshing, setRefreshing] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [viewerTarget, setViewerTarget] = useState<{
    groupUserId: string;
    initialIndex: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contactsMap = useMemo(() => contactsMapQuery.data ?? {}, [contactsMapQuery.data]);
  const allStatuses = useMemo(() => statusesQuery.data ?? [], [statusesQuery.data]);

  const { myGroup, recentGroups, viewedGroups, groupsByUser } = useMemo(() => {
    const byUser = new Map<string, StatusItem[]>();
    for (const item of allStatuses) {
      const isMe = item.user_id === userId;
      const isAcceptedFriend =
        friendsQuery.byUserId.get(item.user_id)?.status === 'accepted';
      if (!isMe && !isAcceptedFriend) continue;

      const list = byUser.get(item.user_id) ?? [];
      list.push(item);
      byUser.set(item.user_id, list);
    }

    let mine: StatusAuthorGroup | null = null;
    const recent: StatusAuthorGroup[] = [];
    const viewed: StatusAuthorGroup[] = [];
    const map = new Map<string, StatusAuthorGroup>();

    for (const [uid, items] of byUser.entries()) {
      const last = items[items.length - 1];
      const author = last?.author;
      const isMe = uid === userId;
      const displayName = isMe
        ? 'Mi estado'
        : (contactsMap[uid] || author?.display_name || 'Usuario');
      const username = author?.username ?? (isMe ? (profile?.username ?? 'tú') : 'usuario');
      const avatarPath = isMe ? (profile?.avatar_path ?? null) : (author?.avatar_path ?? null);
      const hasUnviewed = !isMe && items.some((i) => !i.viewedByMe);

      const group: StatusAuthorGroup = {
        userId: uid,
        username,
        displayName,
        avatarPath,
        latestAt: last?.created_at ?? new Date().toISOString(),
        hasUnviewed,
        items,
      };

      map.set(uid, group);

      if (isMe) {
        mine = group;
      } else if (hasUnviewed) {
        recent.push(group);
      } else {
        viewed.push(group);
      }
    }

    const sortByLatest = (a: StatusAuthorGroup, b: StatusAuthorGroup) =>
      new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();

    recent.sort(sortByLatest);
    viewed.sort(sortByLatest);

    return {
      myGroup: mine,
      recentGroups: recent,
      viewedGroups: viewed,
      groupsByUser: map,
    };
  }, [allStatuses, userId, contactsMap, profile, friendsQuery.byUserId]);

  const activeGroup = viewerTarget ? (groupsByUser.get(viewerTarget.groupUserId) ?? null) : null;

  async function onRefresh() {
    setRefreshing(true);
    await statusesQuery.refetch();
    setRefreshing(false);
  }

  async function handlePickCamera() {
    setError(null);
    try {
      const picked = await pickChatImageFromCamera();
      if (picked) setPendingPhotoUri(picked.localUri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir la cámara.');
    }
  }

  async function handlePickGallery() {
    setError(null);
    try {
      const picked = await pickChatImageFromLibrary();
      if (picked) setPendingPhotoUri(picked.localUri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir tus fotos.');
    }
  }

  const photoOptions: SheetOption[] = [
    {
      label: 'Tomar foto con la cámara',
      icon: 'camera-outline',
      onPress: handlePickCamera,
    },
    {
      label: 'Elegir foto de la galería',
      icon: 'image-outline',
      onPress: handlePickGallery,
    },
  ];

  const myTotalViews = useMemo(() => {
    if (!myGroup) return 0;
    const uniqueViewers = new Set<string>();
    for (const item of myGroup.items) {
      for (const v of item.viewers) {
        if (v.viewer_id !== userId) uniqueViewers.add(v.viewer_id);
      }
    }
    return uniqueViewers.size;
  }, [myGroup, userId]);

  return (
    <Screen edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: 10,
        }}>
        <Wordmark size={27} color={colors.text} />
        <View style={{ flex: 1 }} />
        <Pressable
          hitSlop={8}
          onPress={() => setTextModalOpen(true)}
          style={{ marginRight: 14 }}>
          <Icon name="create-outline" size={23} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setPhotoSheetOpen(true)}>
          <Icon name="camera-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || statusesQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }>
        <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 16 }}>
          <ErrorBanner message={error} />

          {/* Tarjeta Mi estado */}
          <Pressable
            onPress={() => {
              if (myGroup && myGroup.items.length > 0) {
                setViewerTarget({ groupUserId: myGroup.userId, initialIndex: 0 });
              } else {
                setTextModalOpen(true);
              }
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              borderRadius: 20,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            })}>
            <View
              style={{
                padding: 2.5,
                borderRadius: 999,
                borderWidth: 2.5,
                borderColor: myGroup ? colors.primary : 'transparent',
              }}>
              <Avatar name={profile?.display_name} uri={profile?.avatar_path} size={54} />
              {!myGroup ? (
                <View
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: colors.surface,
                  }}>
                  <Icon name="add" size={14} color="#FFFFFF" />
                </View>
              ) : null}
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" style={{ fontSize: 16 }}>
                Mi estado
              </AppText>
              <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                {myGroup
                  ? `${myGroup.items.length} activo${myGroup.items.length === 1 ? '' : 's'} · ${formatListTime(myGroup.latestAt)} · ${myTotalViews} vista${myTotalViews === 1 ? '' : 's'}`
                  : 'Toca para compartir texto o una foto por 24 h'}
              </AppText>
            </View>

            <Pressable
              hitSlop={8}
              onPress={() => setTextModalOpen(true)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="pencil" size={16} color={colors.primary} />
            </Pressable>

            <Pressable
              hitSlop={8}
              onPress={() => setPhotoSheetOpen(true)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="camera-outline" size={18} color={colors.text} />
            </Pressable>
          </Pressable>

          {statusesQuery.isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : recentGroups.length === 0 && viewedGroups.length === 0 ? (
            <View style={{ paddingTop: 28 }}>
              <EmptyState
                icon="aperture-outline"
                title="Sin estados de tus amigos"
                description="Solo puedes ver las historias de los perfiles que tienes agregados como amigos. Los estados duran 24 horas."
              />
            </View>
          ) : (
            <>
              {recentGroups.length > 0 ? (
                <StatusSection
                  title="Recientes"
                  groups={recentGroups}
                  onOpen={(group) => {
                    const firstUnviewed = group.items.findIndex((i) => !i.viewedByMe);
                    setViewerTarget({
                      groupUserId: group.userId,
                      initialIndex: firstUnviewed >= 0 ? firstUnviewed : 0,
                    });
                  }}
                />
              ) : null}

              {viewedGroups.length > 0 ? (
                <StatusSection
                  title="Vistos"
                  groups={viewedGroups}
                  onOpen={(group) =>
                    setViewerTarget({ groupUserId: group.userId, initialIndex: 0 })
                  }
                />
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {/* FABs para publicar estado de texto o foto */}
      <View
        style={{
          position: 'absolute',
          right: 20,
          bottom: 22,
          alignItems: 'center',
          gap: 12,
        }}>
        <Pressable
          onPress={() => setTextModalOpen(true)}
          style={({ pressed }) => ({
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          })}>
          <Icon name="pencil" size={20} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={() => setPhotoSheetOpen(true)}
          style={({ pressed }) => ({
            width: 58,
            height: 58,
            borderRadius: 20,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          })}>
          <Icon name="camera" size={25} color="#FFFFFF" />
        </Pressable>
      </View>

      <ActionSheet
        visible={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        title="Nuevo estado con foto"
        options={photoOptions}
      />

      <TextStatusComposerModal
        visible={textModalOpen}
        loading={createText.isPending}
        onClose={() => setTextModalOpen(false)}
        onPublish={(caption, bgColor) => {
          createText.mutate(
            { caption, bgColor },
            {
              onSuccess: () => setTextModalOpen(false),
              onError: (e) => {
                setTextModalOpen(false);
                setError(e instanceof Error ? e.message : 'No pudimos publicar el estado.');
              },
            },
          );
        }}
      />

      <ImageStatusComposerModal
        key={pendingPhotoUri ?? 'none'}
        uri={pendingPhotoUri}
        loading={createImage.isPending}
        onClose={() => setPendingPhotoUri(null)}
        onPublish={(localUri, caption) => {
          createImage.mutate(
            { localUri, caption },
            {
              onSuccess: () => setPendingPhotoUri(null),
              onError: (e) => {
                setPendingPhotoUri(null);
                setError(
                  e instanceof Error ? e.message : 'No pudimos publicar el estado con foto.',
                );
              },
            },
          );
        }}
      />

      <StatusViewerModal
        key={activeGroup ? `${activeGroup.userId}:${viewerTarget?.initialIndex ?? 0}` : 'closed'}
        group={activeGroup}
        initialIndex={viewerTarget?.initialIndex ?? 0}
        currentUserId={userId ?? ''}
        contactsMap={contactsMap}
        onClose={() => setViewerTarget(null)}
        onViewed={(statusId) => markViewed.mutate(statusId)}
        onReact={async (status, reaction) => {
          await reactStatus.mutateAsync({ status, reaction });
        }}
        onReply={async (status, text) => {
          await replyStatus.mutateAsync({ status, text });
        }}
        onDelete={(status) => {
          removeStatus.mutate(
            { statusId: status.id, mediaPath: status.media_path },
            {
              onSuccess: () => {
                if (activeGroup && activeGroup.items.length <= 1) {
                  setViewerTarget(null);
                }
              },
            },
          );
        }}
      />
    </Screen>
  );
}

function StatusSection({
  title,
  groups,
  onOpen,
}: {
  title: string;
  groups: StatusAuthorGroup[];
  onOpen: (group: StatusAuthorGroup) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <AppText
        variant="label"
        color={colors.textFaint}
        style={{ paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </AppText>

      <View
        style={{
          borderRadius: 18,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}>
        {groups.map((group, idx) => {
          const lastItem = group.items[group.items.length - 1];
          const last = idx === groups.length - 1;
          return (
            <Pressable
              key={group.userId}
              onPress={() => onOpen(group)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                paddingHorizontal: 14,
                paddingVertical: 11,
                backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: colors.border,
              })}>
              <View
                style={{
                  padding: 2.5,
                  borderRadius: 999,
                  borderWidth: 2.5,
                  borderColor: group.hasUnviewed ? colors.accent : colors.border,
                }}>
                <Avatar name={group.displayName} uri={group.avatarPath} size={48} />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 16 }}>
                  {group.displayName}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {lastItem?.kind === 'image'
                    ? `📷 ${lastItem.caption || 'Foto'}`
                    : (lastItem?.caption ?? '')}{' '}
                  · {formatListTime(group.latestAt)}
                </AppText>
              </View>

              {group.items.length > 1 ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: group.hasUnviewed ? colors.primarySoft : colors.surfaceAlt,
                  }}>
                  <AppText
                    variant="micro"
                    color={group.hasUnviewed ? colors.primary : colors.textMuted}
                    style={{ fontWeight: '700' }}>
                    {group.items.length}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TextStatusComposerModal({
  visible,
  loading,
  onClose,
  onPublish,
}: {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onPublish: (caption: string, bgColor: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [text, setText] = useState('');
  const [colorIndex, setColorIndex] = useState(0);

  const bgColor = STATUS_COLORS[colorIndex % STATUS_COLORS.length];

  function handleClose() {
    setText('');
    onClose();
  }

  function handlePublish() {
    const clean = text.trim();
    if (!clean) return;
    onPublish(clean, bgColor);
    setText('');
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: bgColor, paddingBottom: keyboardHeight }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}>
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(0,0,0,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>

            <Pressable
              onPress={() => setColorIndex((i) => (i + 1) % STATUS_COLORS.length)}
              hitSlop={10}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.22)',
              }}>
              <Icon name="color-palette-outline" size={18} color="#FFFFFF" />
              <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>
                Fondo
              </AppText>
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Escribe un estado…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              multiline
              autoFocus
              maxLength={320}
              style={{
                color: '#FFFFFF',
                fontSize: 28,
                fontWeight: '700',
                textAlign: 'center',
                lineHeight: 36,
              }}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingBottom: Math.max(insets.bottom, 12),
              paddingTop: 10,
            }}>
            <AppText variant="micro" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Visible durante 24 horas
            </AppText>

            <Pressable
              onPress={handlePublish}
              disabled={!text.trim() || loading}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: text.trim() ? '#FFFFFF' : 'rgba(255,255,255,0.28)',
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}>
              {loading ? (
                <ActivityIndicator size="small" color={bgColor} />
              ) : (
                <>
                  <AppText
                    variant="bodyStrong"
                    style={{
                      color: text.trim() ? bgColor : 'rgba(255,255,255,0.7)',
                    }}>
                    Publicar
                  </AppText>
                  <Icon
                    name="send"
                    size={16}
                    color={text.trim() ? bgColor : 'rgba(255,255,255,0.7)'}
                  />
                </>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ImageStatusComposerModal({
  uri,
  loading,
  onClose,
  onPublish,
}: {
  uri: string | null;
  loading: boolean;
  onClose: () => void;
  onPublish: (localUri: string, caption?: string | null) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [caption, setCaption] = useState('');

  if (!uri) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#07060C', paddingBottom: keyboardHeight }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}>
            <Pressable
              onPress={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.16)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: 'rgba(13, 12, 20, 0.9)',
            }}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Añade un comentario…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              maxLength={200}
              style={{
                flex: 1,
                color: '#FFFFFF',
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 11,
                fontSize: 15.5,
              }}
            />

            <Pressable
              onPress={() => onPublish(uri, caption.trim() || null)}
              disabled={loading}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Icon name="arrow-up" size={22} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

function StatusViewerModal({
  group,
  initialIndex,
  currentUserId,
  contactsMap,
  onClose,
  onViewed,
  onReact,
  onReply,
  onDelete,
}: {
  group: StatusAuthorGroup | null;
  initialIndex: number;
  currentUserId: string;
  contactsMap: Record<string, string>;
  onClose: () => void;
  onViewed: (statusId: string) => void;
  onReact: (status: StatusItem, reaction: string) => Promise<void>;
  onReply: (status: StatusItem, text: string) => Promise<void>;
  onDelete: (status: StatusItem) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [sending, setSending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [floatingEmoji, setFloatingEmoji] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    contentType: 'status';
    contentId: string;
    reportedUserId: string;
    displayName: string;
  } | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }

  const viewedIdsRef = useRef<Set<string>>(new Set());
  const onViewedRef = useRef(onViewed);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onViewedRef.current = onViewed;
    onCloseRef.current = onClose;
  });

  const items = group?.items ?? [];
  const safeIndex = Math.min(index, Math.max(items.length - 1, 0));
  const current = items[safeIndex] ?? null;
  const currentId = current?.id ?? null;
  const currentViewedByMe = current?.viewedByMe ?? false;
  const isMine = current?.user_id === currentUserId;

  // Marcar como visto una sola vez al abrir cada estado ajeno
  useEffect(() => {
    if (!currentId || isMine || currentViewedByMe) return;
    if (viewedIdsRef.current.has(currentId)) return;
    viewedIdsRef.current.add(currentId);
    onViewedRef.current(currentId);
  }, [currentId, isMine, currentViewedByMe]);

  // Avance automático cada 5 segundos
  useEffect(() => {
    if (!group || !currentId || paused || viewersOpen || isReplying || sending) return;

    const timer = setInterval(() => {
      setProgress((prev) => Math.min(1, prev + 0.02));
    }, 100);

    return () => clearInterval(timer);
  }, [group, currentId, paused, viewersOpen, isReplying, sending]);

  // Pasar al siguiente estado o cerrar al llegar al 100 %
  useEffect(() => {
    if (progress < 1 || !group || !currentId) return;
    const timeout = setTimeout(() => {
      if (safeIndex + 1 < items.length) {
        setProgress(0);
        setIndex((i) => i + 1);
      } else {
        onCloseRef.current();
      }
    }, 20);
    return () => clearTimeout(timeout);
  }, [progress, group, currentId, safeIndex, items.length]);

  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (current?.kind === 'image' && current.media_path) {
      getStatusMediaUrl(current.media_path).then((url) => {
        if (active) setImageUri(url);
      });
    }
    return () => {
      active = false;
    };
  }, [current?.id, current?.kind, current?.media_path]);

  if (!group || !current) return null;

  async function handleQuickReact(emoji: string) {
    if (!current || sending) return;
    setPaused(true);
    setFloatingEmoji(emoji);
    try {
      await onReact(current, emoji);
      showToast(`Reaccionaste con ${emoji}`);
    } catch {
      showToast('No pudimos enviar la reacción');
    } finally {
      setTimeout(() => {
        setFloatingEmoji(null);
        setPaused(false);
      }, 1000);
    }
  }

  async function handleSendReply() {
    const text = replyText.trim();
    if (!text || !current || sending) return;
    setSending(true);
    Keyboard.dismiss();
    try {
      await onReply(current, text);
      setReplyText('');
      setIsReplying(false);
      showToast(`Respuesta enviada a ${group?.displayName ?? 'usuario'}`);
      setTimeout(() => {
        setPaused(false);
        setSending(false);
      }, 600);
    } catch {
      setSending(false);
      showToast('No pudimos enviar la respuesta');
    }
  }

  function goPrev() {
    setProgress(0);
    if (safeIndex > 0) {
      setIndex(safeIndex - 1);
    }
  }

  function goNext() {
    setProgress(0);
    if (safeIndex + 1 < items.length) {
      setIndex(safeIndex + 1);
    } else {
      onClose();
    }
  }

  function confirmDelete() {
    setPaused(true);
    Alert.alert('Eliminar estado', '¿Seguro que quieres eliminar este estado?', [
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: () => setPaused(false),
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          setPaused(false);
          onDelete(current);
        },
      },
    ]);
  }

  const externalViewers = current.viewers.filter((v) => v.viewer_id !== currentUserId);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: current.kind === 'text' ? current.bg_color : '#07060C',
        }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Barras de progreso */}
          <View
            style={{
              flexDirection: 'row',
              gap: 5,
              paddingHorizontal: 12,
              paddingTop: 8,
            }}>
            {items.map((item, idx) => {
              const fill = idx < safeIndex ? 1 : idx === safeIndex ? progress : 0;
              return (
                <View
                  key={item.id}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    overflow: 'hidden',
                  }}>
                  <View
                    style={{
                      width: `${Math.round(fill * 100)}%`,
                      height: '100%',
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                </View>
              );
            })}
          </View>

          {/* Cabecera del autor */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}>
            <Avatar name={group.displayName} uri={group.avatarPath} size={38} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ color: '#FFFFFF', fontSize: 15.5 }}>
                {group.displayName}
              </AppText>
              <AppText variant="micro" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {formatMessageTime(current.created_at)}
              </AppText>
            </View>

            {current.kind === 'image' && imageUri ? (
              <Pressable
                onPress={async () => {
                  setPaused(true);
                  try {
                    const res = await saveImageToGallery(imageUri);
                    showToast(res.message);
                  } finally {
                    setPaused(false);
                  }
                }}
                hitSlop={10}
                style={{ padding: 6 }}>
                <Icon name="download-outline" size={22} color="#FFFFFF" />
              </Pressable>
            ) : null}

            {isMine ? (
              <Pressable onPress={confirmDelete} hitSlop={10} style={{ padding: 6 }}>
                <Icon name="trash-outline" size={22} color="#FFFFFF" />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setPaused(true);
                  setReportTarget({
                    contentType: 'status',
                    contentId: current.id,
                    reportedUserId: current.user_id,
                    displayName: group.displayName,
                  });
                }}
                hitSlop={10}
                style={{ padding: 6 }}>
                <Icon name="flag-outline" size={20} color="#FFFFFF" />
              </Pressable>
            )}

            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 6 }}>
              <Icon name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Contenido principal con zonas táctiles izquierda/derecha */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {current.kind === 'image' && imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
              />
            ) : (
              <View style={{ paddingHorizontal: 28 }}>
                <AppText
                  style={{
                    color: '#FFFFFF',
                    fontSize: 28,
                    fontWeight: '700',
                    lineHeight: 36,
                  }}
                  align="center">
                  {current.caption}
                </AppText>
              </View>
            )}

            {current.kind === 'image' && current.caption ? (
              <View
                style={{
                  position: 'absolute',
                  bottom: 24,
                  left: 20,
                  right: 20,
                  backgroundColor: 'rgba(0,0,0,0.58)',
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}>
                <AppText style={{ color: '#FFFFFF', fontSize: 16 }} align="center">
                  {current.caption}
                </AppText>
              </View>
            ) : null}

            {/* Zonas invisibles para retroceder / avanzar / pausar */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                flexDirection: 'row',
              }}>
              <Pressable
                style={{ flex: 3 }}
                onPress={goPrev}
                onLongPress={() => setPaused(true)}
                onPressOut={() => setPaused(false)}
              />
              <Pressable
                style={{ flex: 7 }}
                onPress={goNext}
                onLongPress={() => setPaused(true)}
                onPressOut={() => setPaused(false)}
              />
            </View>
          </View>

          {/* Pie para el autor: quién vio el estado */}
          {isMine ? (
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 12,
                paddingBottom: Math.max(insets.bottom, 8),
              }}>
              <Pressable
                onPress={() => setViewersOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                }}>
                <Icon name="eye-outline" size={18} color="#FFFFFF" />
                <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {externalViewers.length} vista{externalViewers.length === 1 ? '' : 's'}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingTop: 8,
                  paddingBottom: Math.max(insets.bottom, 10),
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(255,255,255,0.08)',
                }}>
                {/* Fila de reacciones rápidas */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: 4,
                    marginBottom: 10,
                  }}>
                  {QUICK_REACTIONS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => handleQuickReact(emoji)}
                      hitSlop={6}
                      style={({ pressed }) => ({
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: 'rgba(255,255,255,0.16)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: [{ scale: pressed ? 1.25 : 1 }],
                      })}>
                      <AppText style={{ fontSize: 23 }}>{emoji}</AppText>
                    </Pressable>
                  ))}
                </View>

                {/* Input para responder al autor */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.25)',
                    paddingHorizontal: 14,
                    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
                    gap: 10,
                  }}>
                  <TextInput
                    value={replyText}
                    onChangeText={setReplyText}
                    onFocus={() => {
                      setIsReplying(true);
                      setPaused(true);
                    }}
                    onBlur={() => {
                      if (!replyText.trim()) {
                        setIsReplying(false);
                        setPaused(false);
                      }
                    }}
                    placeholder={`Responder a ${group.displayName}…`}
                    placeholderTextColor="rgba(255,255,255,0.65)"
                    style={{
                      flex: 1,
                      color: '#FFFFFF',
                      fontSize: 15,
                      paddingVertical: 4,
                    }}
                    returnKeyType="send"
                    onSubmitEditing={handleSendReply}
                  />

                  {replyText.trim().length > 0 ? (
                    <Pressable
                      onPress={handleSendReply}
                      disabled={sending}
                      style={({ pressed }) => ({
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: colors.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                      })}>
                      {sending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Icon name="arrow-up" size={18} color="#FFFFFF" />
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>

        {/* Reacción flotante al centro */}
        {floatingEmoji ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText style={{ fontSize: 80 }}>{floatingEmoji}</AppText>
          </View>
        ) : null}

        {/* Toast flotante */}
        {toastMessage ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: isMine ? 70 : 150,
              alignSelf: 'center',
              backgroundColor: 'rgba(15,14,24,0.92)',
              borderRadius: 20,
              paddingHorizontal: 18,
              paddingVertical: 9,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 8,
            }}>
            <AppText style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '600' }}>
              {toastMessage}
            </AppText>
          </View>
        ) : null}

        {/* Modal de espectadores */}
        <Modal
          visible={viewersOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setViewersOpen(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
            onPress={() => setViewersOpen(false)}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: colors.bgElevated,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 14,
                paddingHorizontal: 18,
                paddingBottom: Math.max(insets.bottom, 18),
                maxHeight: '60%',
                borderTopWidth: 1,
                borderColor: colors.border,
              }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}>
                <AppText variant="subtitle" style={{ fontSize: 17 }}>
                  Visto por ({externalViewers.length})
                </AppText>
                <Pressable onPress={() => setViewersOpen(false)} hitSlop={8}>
                  <Icon name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              {externalViewers.length === 0 ? (
                <View style={{ paddingVertical: 24 }}>
                  <AppText color={colors.textMuted} align="center">
                    Aún nadie ha visto este estado.
                  </AppText>
                </View>
              ) : (
                <ScrollView>
                  {externalViewers.map((viewer) => {
                    const name =
                      contactsMap[viewer.viewer_id] ||
                      viewer.profile?.display_name ||
                      'Usuario';
                    return (
                      <View
                        key={viewer.viewer_id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 10,
                        }}>
                        <Avatar
                          name={name}
                          uri={viewer.profile?.avatar_path}
                          size={40}
                        />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <AppText variant="bodyStrong">{name}</AppText>
                            {viewer.reaction ? (
                              <View
                                style={{
                                  backgroundColor: colors.surface,
                                  borderRadius: 8,
                                  paddingHorizontal: 6,
                                  paddingVertical: 1,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                }}>
                                <AppText style={{ fontSize: 14 }}>{viewer.reaction}</AppText>
                              </View>
                            ) : null}
                          </View>
                          {viewer.profile?.username ? (
                            <AppText variant="micro" color={colors.textMuted}>
                              @{viewer.profile.username}
                            </AppText>
                          ) : null}
                        </View>
                        <AppText variant="micro" color={colors.textFaint}>
                          {formatMessageTime(viewer.viewed_at)}
                        </AppText>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <ReportModal
          visible={Boolean(reportTarget)}
          onClose={() => {
            setReportTarget(null);
            setPaused(false);
          }}
          target={reportTarget}
        />
      </View>
    </Modal>
  );
}
