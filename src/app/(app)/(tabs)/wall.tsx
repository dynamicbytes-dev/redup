import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import { createDirectConversation } from '@/features/chats/api';
import { pickChatImageFromLibrary, uploadChatMedia } from '@/features/chats/media';
import { sendFriendRequest } from '@/features/friends/api';
import {
  useCreateWallComment,
  useCreateWallPost,
  useDeleteWallComment,
  useDeleteWallPost,
  usePostComments,
  useToggleCommentReaction,
  useTogglePostReaction,
  useWallFeed,
  useWallRealtime,
} from '@/features/wall/hooks';
import { saveImageToGallery, shareLocalOrRemoteMedia } from '@/lib/save-media';
import type { WallComment, WallPost } from '@/lib/types';
import { useTheme } from '@/theme';

export default function WallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, profile } = useSession();

  const { data: feed = [], isLoading, isRefetching, refetch } = useWallFeed();
  useWallRealtime();

  // Estados de Crear Post
  const [composerOpen, setComposerOpen] = useState(false);
  const [postText, setPostText] = useState('');
  const [postMedia, setPostMedia] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Estados de Modal de Comentarios
  const [activePost, setActivePost] = useState<WallPost | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Mutaciones
  const createPostMutation = useCreateWallPost();
  const deletePostMutation = useDeleteWallPost();
  const toggleReactionMutation = useTogglePostReaction();

  // Handler para seleccionar foto del post
  async function handlePickImage() {
    try {
      const picked = await pickChatImageFromLibrary();
      if (picked) {
        setPostMedia(picked.localUri);
      }
    } catch {
      Alert.alert('Aviso', 'No se pudo seleccionar la imagen.');
    }
  }

  // Handler para publicar post
  async function handlePublish() {
    const text = postText.trim();
    if (!text || publishing) return;

    setPublishing(true);
    try {
      let uploadedPath: string | null = null;
      if (postMedia && userId) {
        const uploadRes = await uploadChatMedia({
          conversationId: `wall/${userId}`,
          messageId: crypto.randomUUID(),
          media: {
            kind: 'image',
            localUri: postMedia,
            fileName: `wall-${Date.now()}.jpg`,
            mimeType: 'image/jpeg',
            ext: 'jpg',
          },
        });
        uploadedPath = uploadRes.path;
      }

      await createPostMutation.mutateAsync({
        content: text,
        mediaPath: uploadedPath,
      });

      setPostText('');
      setPostMedia(null);
      setComposerOpen(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No pudimos publicar tu post.');
    } finally {
      setPublishing(false);
    }
  }

  // Handler clave de la regla del usuario:
  // "cuando le des clic al nombre de usuario de una persona te mande al chat, pero si no lo tienes agregado como amigo, te mande a enviar la solicitud."
  async function handleAuthorPress(author: { id: string; username: string; display_name: string }, isFriend: boolean) {
    if (!userId) return;

    if (author.id === userId) {
      router.push('/profile');
      return;
    }

    if (isFriend) {
      try {
        const convId = await createDirectConversation(author.id);
        router.push({
          pathname: '/chat/[id]',
          params: { id: convId },
        });
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo abrir el chat.');
      }
    } else {
      Alert.alert(
        'No son amigos aún',
        `${author.display_name || `@${author.username}`} no está en tu lista de amigos. ¿Deseas enviarle una solicitud de amistad?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ver perfil',
            onPress: () => {
              router.push({
                pathname: '/contact/[id]',
                params: { id: author.id },
              });
            },
          },
          {
            text: 'Enviar solicitud',
            style: 'default',
            onPress: async () => {
              try {
                await sendFriendRequest(author.id);
                Alert.alert('Solicitud enviada', `Le enviaste una solicitud de amistad a @${author.username}.`);
              } catch (err) {
                Alert.alert('Aviso', err instanceof Error ? err.message : 'No se pudo enviar la solicitud.');
              }
            },
          },
        ],
      );
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header estilo X */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        }}>
        <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
          <Avatar
            name={profile?.display_name || profile?.username || 'Usuario'}
            uri={profile?.avatar_path}
            size={36}
          />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="newspaper-outline" size={20} color={colors.primary} />
          <AppText variant="title" style={{ fontSize: 18 }}>
            Muro
          </AppText>
        </View>

        <Pressable onPress={() => setComposerOpen(true)} hitSlop={8} style={{ padding: 4 }}>
          <Icon name="create-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Barra superior de creación rápida estilo Twitter */}
      <Pressable
        onPress={() => setComposerOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}>
        <Avatar
          name={profile?.display_name || profile?.username || 'Tú'}
          uri={profile?.avatar_path}
          size={38}
        />
        <AppText color={colors.textMuted} style={{ flex: 1, fontSize: 15 }}>
          ¿Qué está pasando? Comparte con tus amigos…
        </AppText>
        <Icon name="image-outline" size={20} color={colors.primary} />
      </Pressable>

      {/* Feed de Posts */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch();
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          renderItem={({ item }) => {
            const isMine = item.author_id === userId;
            const timeAgo = formatDistanceToNowStrict(new Date(item.created_at), {
              addSuffix: true,
              locale: es,
            });

            return (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.bg,
                }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {/* Avatar con clic */}
                  <Pressable
                    onPress={() =>
                      handleAuthorPress(
                        {
                          id: item.author.id,
                          username: item.author.username,
                          display_name: item.author.display_name,
                        },
                        item.is_friend,
                      )
                    }>
                    <Avatar
                      name={item.author.display_name || item.author.username}
                      uri={item.author.avatar_path}
                      size={44}
                    />
                  </Pressable>

                  {/* Contenido del Post */}
                  <View style={{ flex: 1 }}>
                    {/* Header autor y fecha */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                      <Pressable
                        onPress={() =>
                          handleAuthorPress(
                            {
                              id: item.author.id,
                              username: item.author.username,
                              display_name: item.author.display_name,
                            },
                            item.is_friend,
                          )
                        }
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
                          {item.author.display_name || item.author.username}
                        </AppText>
                        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                          @{item.author.username} · {timeAgo}
                        </AppText>
                      </Pressable>

                      {isMine ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            Alert.alert('Eliminar publicación', '¿Deseas eliminar este post?', [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Eliminar',
                                style: 'destructive',
                                onPress: () => deletePostMutation.mutate(item.id),
                              },
                            ]);
                          }}>
                          <Icon name="trash-outline" size={17} color={colors.textFaint} />
                        </Pressable>
                      ) : null}
                    </View>

                    {/* Texto del post estilo tweet */}
                    <AppText
                      variant="body"
                      color={colors.text}
                      style={{ marginTop: 6, fontSize: 15.5, lineHeight: 22 }}>
                      {item.content}
                    </AppText>

                    {/* Imagen adjunta */}
                    {item.media_path ? (
                      <Pressable
                        onPress={() => setLightboxImage(item.media_path)}
                        style={{
                          marginTop: 10,
                          borderRadius: 16,
                          overflow: 'hidden',
                          maxHeight: 280,
                          backgroundColor: colors.surfaceAlt,
                        }}>
                        <Image
                          source={{ uri: item.media_path }}
                          style={{ width: '100%', height: 240 }}
                          contentFit="cover"
                        />
                      </Pressable>
                    ) : null}

                    {/* Barra de Acciones estilo X */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 12,
                        paddingRight: 32,
                      }}>
                      {/* Botón Comentarios */}
                      <Pressable
                        onPress={() => setActivePost(item)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name="chatbubble-outline" size={18} color={colors.textMuted} />
                        <AppText variant="caption" color={colors.textMuted}>
                          {item.comments_count > 0 ? item.comments_count : ''}
                        </AppText>
                      </Pressable>

                      {/* Botón Reacción / Like */}
                      <Pressable
                        onPress={() =>
                          toggleReactionMutation.mutate({ postId: item.id, reaction: '❤️' })
                        }
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon
                          name={item.my_reaction ? 'heart' : 'heart-outline'}
                          size={19}
                          color={item.my_reaction ? '#E0245E' : colors.textMuted}
                        />
                        <AppText
                          variant="caption"
                          color={item.my_reaction ? '#E0245E' : colors.textMuted}>
                          {item.likes_count > 0 ? item.likes_count : ''}
                        </AppText>
                      </Pressable>

                      {/* Botón Compartir */}
                      <Pressable
                        onPress={() => {
                          if (item.media_path) {
                            shareLocalOrRemoteMedia(item.media_path);
                          } else {
                            Alert.alert('Muro de Redup', `"${item.content}"`);
                          }
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name="share-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
                gap: 12,
                marginTop: 40,
              }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="newspaper-outline" size={36} color={colors.primary} />
              </View>
              <AppText variant="title" align="center">
                El Muro está tranquilo
              </AppText>
              <AppText variant="body" color={colors.textMuted} align="center">
                Sé el primero en compartir lo que piensas con tus amigos. ¡Tus publicaciones
                aparecerán aquí!
              </AppText>
              <Button
                title="Publicar algo ahora"
                icon="create-outline"
                onPress={() => setComposerOpen(true)}
                style={{ marginTop: 8 }}
              />
            </View>
          }
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: REDACTAR PUBLICACIÓN (ESTILO X / TWITTER) */}
      {/* ========================================================= */}
      <Modal
        visible={composerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setComposerOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          {/* Header del redactor */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}>
            <Pressable hitSlop={10} onPress={() => setComposerOpen(false)}>
              <AppText color={colors.textMuted} style={{ fontSize: 16 }}>
                Cancelar
              </AppText>
            </Pressable>

            <Button
              title="Publicar"
              size="md"
              loading={publishing}
              disabled={publishing || !postText.trim()}
              onPress={handlePublish}
            />
          </View>

          {/* Área de texto del tweet */}
          <View style={{ flex: 1, padding: 16 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Avatar
                name={profile?.display_name || profile?.username || 'Tú'}
                uri={profile?.avatar_path}
                size={42}
              />

              <View style={{ flex: 1 }}>
                <TextField
                  placeholder="¿Qué está pasando?"
                  value={postText}
                  onChangeText={setPostText}
                  multiline
                  autoFocus
                  maxLength={2000}
                  style={{
                    fontSize: 18,
                    lineHeight: 24,
                    color: colors.text,
                    minHeight: 120,
                  }}
                />

                {postMedia ? (
                  <View style={{ marginTop: 12, position: 'relative' }}>
                    <Image
                      source={{ uri: postMedia }}
                      style={{ width: '100%', height: 200, borderRadius: 14 }}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => setPostMedia(null)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Icon name="close" size={18} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Barra inferior de adjuntos */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}>
            <Pressable onPress={handlePickImage} hitSlop={8} style={{ padding: 6 }}>
              <Icon name="image-outline" size={24} color={colors.primary} />
            </Pressable>

            <AppText variant="caption" color={colors.textMuted}>
              {2000 - postText.length} caracteres
            </AppText>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: COMENTARIOS Y RESPUESTAS DEL POST */}
      {/* ========================================================= */}
      {activePost ? (
        <PostCommentsModal
          post={activePost}
          onClose={() => setActivePost(null)}
          onAuthorPress={handleAuthorPress}
        />
      ) : null}

      {/* Lightbox para imágenes */}
      <Modal
        visible={Boolean(lightboxImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxImage(null)}>
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                padding: 16,
                gap: 12,
              }}>
              <Pressable
                onPress={async () => {
                  if (lightboxImage) await shareLocalOrRemoteMedia(lightboxImage);
                }}
                style={{ padding: 8 }}>
                <Icon name="share-outline" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (lightboxImage) {
                    const res = await saveImageToGallery(lightboxImage);
                    Alert.alert(res.success ? 'Listo' : 'Aviso', res.message);
                  }
                }}
                style={{ padding: 8 }}>
                <Icon name="download-outline" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable onPress={() => setLightboxImage(null)} style={{ padding: 8 }}>
                <Icon name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {lightboxImage ? (
                <Image
                  source={{ uri: lightboxImage }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              ) : null}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================================
// COMPONENTE: MODAL DE COMENTARIOS Y RESPUESTAS (ESTILO HILO DE TWITTER)
// ============================================================================
function PostCommentsModal({
  post,
  onClose,
  onAuthorPress,
}: {
  post: WallPost;
  onClose: () => void;
  onAuthorPress: (author: { id: string; username: string; display_name: string }, isFriend: boolean) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();

  const { data: comments = [], isLoading } = usePostComments(post.id);
  const createCommentMutation = useCreateWallComment(post.id);
  const deleteCommentMutation = useDeleteWallComment(post.id);
  const toggleReactionMutation = useToggleCommentReaction(post.id);

  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<WallComment | null>(null);
  const [sending, setSending] = useState(false);

  // Manejo fluido de teclado anti-superposición
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  const fallbackKeyboardHeight = useSharedValue(0);

  useEffect(() => {
    const onShow = (e: any) => {
      const h = Math.max(0, e?.endCoordinates?.height ?? 0);
      const duration = Platform.OS === 'ios' ? (e?.duration ?? 250) : 180;
      fallbackKeyboardHeight.value = withTiming(h, {
        duration,
        easing: Easing.out(Easing.ease),
      });
    };

    const onHide = (e: any) => {
      const duration = Platform.OS === 'ios' ? (e?.duration ?? 250) : 180;
      fallbackKeyboardHeight.value = withTiming(0, {
        duration,
        easing: Easing.out(Easing.ease),
      });
    };

    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];

    return () => {
      for (const sub of subs) sub.remove();
    };
  }, [fallbackKeyboardHeight]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const reanimatedHeight = Math.max(0, keyboard.height.value);
    const nativeHeight = Math.max(0, fallbackKeyboardHeight.value);
    const activeKeyboard = Math.max(reanimatedHeight, nativeHeight);
    return {
      paddingBottom: Math.max(activeKeyboard, insets.bottom),
    };
  });

  async function handleSendComment() {
    const text = commentText.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      await createCommentMutation.mutateAsync({
        postId: post.id,
        content: text,
        parentCommentId: replyingTo?.id ?? null,
      });
      setCommentText('');
      setReplyingTo(null);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No pudimos publicar el comentario.');
    } finally {
      setSending(false);
    }
  }

  // Agrupar comentarios raíz y respuestas
  const rootComments = comments.filter((c) => !c.parent_comment_id);
  const repliesByParentId = new Map<string, WallComment[]>();
  for (const c of comments) {
    if (c.parent_comment_id) {
      const list = repliesByParentId.get(c.parent_comment_id) ?? [];
      list.push(c);
      repliesByParentId.set(c.parent_comment_id, list);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            backgroundColor: colors.bgElevated,
          }}>
          <AppText variant="title" style={{ fontSize: 17 }}>
            Publicación
          </AppText>
          <Pressable hitSlop={10} onPress={onClose}>
            <Icon name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Animated.View style={[{ flex: 1 }, animatedContainerStyle]}>
          <FlatList
            data={rootComments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}
            ListHeaderComponent={
              /* Post Original */
              <View
                style={{
                  paddingBottom: 16,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                  marginBottom: 12,
                }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable
                    onPress={() =>
                      onAuthorPress(
                        {
                          id: post.author.id,
                          username: post.author.username,
                          display_name: post.author.display_name,
                        },
                        post.is_friend,
                      )
                    }>
                    <Avatar
                      name={post.author.display_name || post.author.username}
                      uri={post.author.avatar_path}
                      size={46}
                    />
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Pressable
                      onPress={() =>
                        onAuthorPress(
                          {
                            id: post.author.id,
                            username: post.author.username,
                            display_name: post.author.display_name,
                          },
                          post.is_friend,
                        )
                      }>
                      <AppText variant="bodyStrong">
                        {post.author.display_name || post.author.username}
                      </AppText>
                      <AppText variant="caption" color={colors.textMuted}>
                        @{post.author.username}
                      </AppText>
                    </Pressable>
                  </View>
                </View>

                <AppText
                  variant="body"
                  color={colors.text}
                  style={{ marginTop: 10, fontSize: 16, lineHeight: 23 }}>
                  {post.content}
                </AppText>
              </View>
            }
            renderItem={({ item }) => {
              const replies = repliesByParentId.get(item.id) ?? [];
              const isMine = item.author_id === userId;

              return (
                <View style={{ marginVertical: 8 }}>
                  {/* Comentario Raíz */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={() =>
                        onAuthorPress(
                          {
                            id: item.author.id,
                            username: item.author.username,
                            display_name: item.author.display_name,
                          },
                          item.is_friend,
                        )
                      }>
                      <Avatar
                        name={item.author.display_name || item.author.username}
                        uri={item.author.avatar_path}
                        size={36}
                      />
                    </Pressable>

                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                        <Pressable
                          onPress={() =>
                            onAuthorPress(
                              {
                                id: item.author.id,
                                username: item.author.username,
                                display_name: item.author.display_name,
                              },
                              item.is_friend,
                            )
                          }
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <AppText variant="bodyStrong" style={{ fontSize: 14 }}>
                            {item.author.display_name || item.author.username}
                          </AppText>
                          <AppText variant="micro" color={colors.textMuted}>
                            @{item.author.username}
                          </AppText>
                        </Pressable>

                        {isMine || post.author_id === userId ? (
                          <Pressable
                            hitSlop={8}
                            onPress={() => deleteCommentMutation.mutate(item.id)}>
                            <Icon name="trash-outline" size={15} color={colors.textFaint} />
                          </Pressable>
                        ) : null}
                      </View>

                      <AppText
                        variant="body"
                        color={colors.text}
                        style={{ marginTop: 3, lineHeight: 20 }}>
                        {item.content}
                      </AppText>

                      {/* Botones de acción del comentario */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 16,
                          marginTop: 6,
                        }}>
                        <Pressable
                          onPress={() =>
                            toggleReactionMutation.mutate({ commentId: item.id, reaction: '❤️' })
                          }
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Icon
                            name={item.my_reaction ? 'heart' : 'heart-outline'}
                            size={15}
                            color={item.my_reaction ? '#E0245E' : colors.textMuted}
                          />
                          {item.likes_count > 0 ? (
                            <AppText variant="micro" color={colors.textMuted}>
                              {item.likes_count}
                            </AppText>
                          ) : null}
                        </Pressable>

                        <Pressable onPress={() => setReplyingTo(item)}>
                          <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
                            Responder
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {/* Respuestas anidadas al comentario estilo Twitter */}
                  {replies.length > 0 ? (
                    <View style={{ marginLeft: 36, marginTop: 8, gap: 8 }}>
                      {replies.map((reply) => {
                        const isReplyMine = reply.author_id === userId;
                        return (
                          <View key={reply.id} style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              onPress={() =>
                                onAuthorPress(
                                  {
                                    id: reply.author.id,
                                    username: reply.author.username,
                                    display_name: reply.author.display_name,
                                  },
                                  reply.is_friend,
                                )
                              }>
                              <Avatar
                                name={reply.author.display_name || reply.author.username}
                                uri={reply.author.avatar_path}
                                size={28}
                              />
                            </Pressable>

                            <View style={{ flex: 1 }}>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                }}>
                                <Pressable
                                  onPress={() =>
                                    onAuthorPress(
                                      {
                                        id: reply.author.id,
                                        username: reply.author.username,
                                        display_name: reply.author.display_name,
                                      },
                                      reply.is_friend,
                                    )
                                  }
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <AppText variant="bodyStrong" style={{ fontSize: 13 }}>
                                    {reply.author.display_name || reply.author.username}
                                  </AppText>
                                  <AppText variant="micro" color={colors.textMuted}>
                                    @{reply.author.username}
                                  </AppText>
                                </Pressable>

                                {isReplyMine || post.author_id === userId ? (
                                  <Pressable
                                    hitSlop={8}
                                    onPress={() => deleteCommentMutation.mutate(reply.id)}>
                                    <Icon name="trash-outline" size={14} color={colors.textFaint} />
                                  </Pressable>
                                ) : null}
                              </View>

                              <AppText
                                variant="body"
                                color={colors.text}
                                style={{ marginTop: 2, fontSize: 14, lineHeight: 19 }}>
                                {reply.content}
                              </AppText>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={
              isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
              ) : (
                <View style={{ alignItems: 'center', padding: 24, gap: 6 }}>
                  <AppText variant="caption" color={colors.textMuted}>
                    Aún no hay comentarios. ¡Sé el primero en responder!
                  </AppText>
                </View>
              )
            }
          />

          {/* Banner de "Respondiendo a @usuario" */}
          {replyingTo ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor: colors.surfaceAlt,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              }}>
              <AppText variant="caption" color={colors.textMuted}>
                Respondiendo a @{replyingTo.author.username}
              </AppText>
              <Pressable hitSlop={8} onPress={() => setReplyingTo(null)}>
                <Icon name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {/* Input para agregar comentario */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
              backgroundColor: colors.bgElevated,
            }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.surfaceAlt,
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: Platform.OS === 'ios' ? 8 : 4,
                minHeight: 38,
                justifyContent: 'center',
              }}>
              <TextField
                placeholder={
                  replyingTo
                    ? `Responder a @${replyingTo.author.username}…`
                    : 'Publica tu comentario…'
                }
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={1000}
                style={{
                  fontSize: 14.5,
                  color: colors.text,
                  padding: 0,
                  margin: 0,
                }}
              />
            </View>

            <Pressable
              onPress={handleSendComment}
              disabled={!commentText.trim() || sending}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: commentText.trim() ? colors.primary : colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: commentText.trim() ? (pressed ? 0.8 : 1) : 0.5,
              })}>
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon
                  name="arrow-up"
                  size={18}
                  color={commentText.trim() ? '#FFFFFF' : colors.textMuted}
                />
              )}
            </Pressable>
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}
