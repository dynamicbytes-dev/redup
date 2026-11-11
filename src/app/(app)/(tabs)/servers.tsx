import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import { pickChatImageFromLibrary } from '@/features/chats/media';
import {
  getServerInviteLink,
  getServerPreviewByCode,
  shareServerInvite,
} from '@/features/servers/api';
import {
  useCreateChannel,
  useCreateServer,
  useDeleteServer,
  useJoinServer,
  useLeaveServer,
  useMyServers,
  useServerChannels,
} from '@/features/servers/hooks';
import type { ChannelType, Server, ServerPreview } from '@/lib/types';
import { useTheme } from '@/theme';

export default function ServersTabScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();

  const { data: servers = [], isLoading: loadingServers } = useMyServers(userId);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  // Mantener el servidor seleccionado o elegir el primero por defecto
  const activeServer = useMemo<Server | null>(() => {
    if (!servers.length) return null;
    if (selectedServerId) {
      const match = servers.find((s) => s.id === selectedServerId);
      if (match) return match;
    }
    return servers[0];
  }, [servers, selectedServerId]);

  const { data: channels = [], isLoading: loadingChannels } = useServerChannels(
    activeServer?.id ?? '',
  );

  // Modales
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [newChannelModalOpen, setNewChannelModalOpen] = useState(false);
  const [serverOptionsOpen, setServerOptionsOpen] = useState(false);

  // Estados de Crear Servidor
  const [newServerName, setNewServerName] = useState('');
  const [newServerDesc, setNewServerDesc] = useState('');
  const [newServerAvatar, setNewServerAvatar] = useState<string | null>(null);

  // Estados de Unirse
  const [joinInput, setJoinInput] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [serverPreview, setServerPreview] = useState<ServerPreview | null>(null);

  // Estados de Crear Canal
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('text');
  const [channelTopic, setChannelTopic] = useState('');

  // Mutaciones
  const createServerMutation = useCreateServer(userId);
  const joinServerMutation = useJoinServer(userId);
  const createChannelMutation = useCreateChannel(activeServer?.id ?? '');
  const deleteServerMutation = useDeleteServer(userId);
  const leaveServerMutation = useLeaveServer(userId);

  // Handlers
  async function handlePickServerAvatar() {
    try {
      const picked = await pickChatImageFromLibrary();
      if (picked) {
        setNewServerAvatar(picked.localUri);
      }
    } catch {
      Alert.alert('Aviso', 'No se pudo seleccionar la imagen.');
    }
  }

  async function handleCreateServer() {
    if (!newServerName.trim()) {
      return Alert.alert('Nombre requerido', 'Ingresa un nombre para tu servidor.');
    }

    try {
      const res = await createServerMutation.mutateAsync({
        name: newServerName.trim(),
        description: newServerDesc.trim() || null,
        avatarPath: newServerAvatar,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModalOpen(false);
      setNewServerName('');
      setNewServerDesc('');
      setNewServerAvatar(null);
      setSelectedServerId(res.id);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo crear el servidor.');
    }
  }

  async function handleSearchPreview() {
    if (!joinInput.trim()) return;
    setPreviewing(true);
    setServerPreview(null);
    try {
      const preview = await getServerPreviewByCode(joinInput);
      if (!preview) {
        Alert.alert('No encontrado', 'No se encontró ningún servidor con ese código o enlace.');
      } else {
        setServerPreview(preview);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Error al buscar el servidor.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleJoinServer(codeToJoin?: string) {
    const code = codeToJoin || serverPreview?.invite_code || joinInput;
    if (!code) return;

    try {
      const res = await joinServerMutation.mutateAsync(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJoinModalOpen(false);
      setJoinInput('');
      setServerPreview(null);
      setSelectedServerId(res.server_id);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No pudimos unirte al servidor.');
    }
  }

  async function handleCreateChannel() {
    if (!activeServer || !channelName.trim()) {
      return Alert.alert('Nombre requerido', 'Escribe el nombre del canal.');
    }

    try {
      await createChannelMutation.mutateAsync({
        serverId: activeServer.id,
        name: channelName.trim(),
        type: channelType,
        topic: channelTopic.trim() || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewChannelModalOpen(false);
      setChannelName('');
      setChannelTopic('');
      setChannelType('text');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo crear el canal.');
    }
  }

  async function handleShareServer(server: Server) {
    try {
      await shareServerInvite(server.name, server.invite_code);
    } catch {
      // Ignorar cancelaciones
    }
  }

  async function handleCopyInviteLink(server: Server) {
    const link = getServerInviteLink(server.invite_code);
    await Clipboard.setStringAsync(link);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Enlace copiado', 'El enlace de invitación se copió a tu portapapeles.');
  }

  const isOwner = activeServer?.owner_id === userId;
  const isAdmin = isOwner || activeServer?.my_role === 'admin';

  const serverSheetOptions: SheetOption[] = [
    {
      label: 'Compartir enlace de invitación',
      icon: 'share-social-outline',
      onPress: () => activeServer && handleShareServer(activeServer),
    },
    {
      label: 'Copiar enlace de invitación',
      icon: 'copy-outline',
      onPress: () => activeServer && handleCopyInviteLink(activeServer),
    },
  ];

  if (isAdmin) {
    serverSheetOptions.push({
      label: 'Crear nuevo canal',
      icon: 'add-circle-outline',
      onPress: () => setNewChannelModalOpen(true),
    });
  }

  if (isOwner) {
    serverSheetOptions.push({
      label: 'Eliminar servidor',
      icon: 'trash-outline',
      destructive: true,
      onPress: () => {
        Alert.alert(
          'Eliminar servidor',
          `¿Estás seguro de que deseas eliminar permanentemente "${activeServer?.name}"? Esta acción no se puede deshacer.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: async () => {
                if (activeServer) {
                  await deleteServerMutation.mutateAsync(activeServer.id);
                  setSelectedServerId(null);
                }
              },
            },
          ],
        );
      },
    });
  } else {
    serverSheetOptions.push({
      label: 'Abandonar servidor',
      icon: 'exit-outline',
      destructive: true,
      onPress: () => {
        Alert.alert(
          'Abandonar servidor',
          `¿Seguro que deseas salir de "${activeServer?.name}"?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Abandonar',
              style: 'destructive',
              onPress: async () => {
                if (activeServer && userId) {
                  await leaveServerMutation.mutateAsync({
                    serverId: activeServer.id,
                    memberUserId: userId,
                  });
                  setSelectedServerId(null);
                }
              },
            },
          ],
        );
      },
    });
  }

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* ========================================================= */}
        {/* BARRA LATERAL ESTILO DISCORD (Izquierda) */}
        {/* ========================================================= */}
        <View
          style={{
            width: 76,
            backgroundColor: colors.bgElevated,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: colors.border,
            alignItems: 'center',
            paddingVertical: 12,
            gap: 12,
          }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', gap: 12 }}>
            {servers.map((server) => {
              const isSelected = activeServer?.id === server.id;
              const initials = server.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <View key={server.id} style={{ alignItems: 'center', width: '100%' }}>
                  {/* Píldora indicadora izquierda */}
                  {isSelected ? (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 10,
                        bottom: 10,
                        width: 4.5,
                        backgroundColor: colors.primary,
                        borderTopRightRadius: 4,
                        borderBottomRightRadius: 4,
                      }}
                    />
                  ) : null}

                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedServerId(server.id);
                    }}
                    style={({ pressed }) => ({
                      width: 52,
                      height: 52,
                      borderRadius: isSelected ? 16 : 26,
                      backgroundColor: isSelected ? colors.primary : colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: colors.accent,
                    })}>
                    {server.avatar_path ? (
                      <Image
                        source={{ uri: server.avatar_path }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : (
                      <AppText
                        style={{
                          color: isSelected ? '#FFFFFF' : colors.text,
                          fontWeight: '700',
                          fontSize: 16,
                        }}>
                        {initials}
                      </AppText>
                    )}
                  </Pressable>
                </View>
              );
            })}

            {/* Separador fino */}
            <View
              style={{
                width: 36,
                height: 2,
                borderRadius: 1,
                backgroundColor: colors.border,
                marginVertical: 4,
              }}
            />

            {/* Botón "+" para crear servidor */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCreateModalOpen(true);
              }}
              style={({ pressed }) => ({
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: '#23A55A',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}>
              <Icon name="add" size={26} color="#FFFFFF" />
            </Pressable>

            {/* Botón de Brújula para unirse con enlace */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setJoinModalOpen(true);
              }}
              style={({ pressed }) => ({
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}>
              <Icon name="compass-outline" size={24} color={colors.primary} />
            </Pressable>
          </ScrollView>
        </View>

        {/* ========================================================= */}
        {/* PANEL PRINCIPAL DEL SERVIDOR Y CANALES (Derecha) */}
        {/* ========================================================= */}
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {loadingServers ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : activeServer ? (
            <View style={{ flex: 1 }}>
              {/* Encabezado del Servidor */}
              <Pressable
                onPress={() => setServerOptionsOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : colors.bgElevated,
                })}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 17 }}>
                    {activeServer.name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {activeServer.member_count ?? 1} miembro
                    {(activeServer.member_count ?? 1) === 1 ? '' : 's'} · Código:{' '}
                    {activeServer.invite_code}
                  </AppText>
                </View>

                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name="chevron-down" size={18} color={colors.text} />
                </View>
              </Pressable>

              {/* Botón de acción rápida: Compartir enlace de invitación */}
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <Pressable
                  onPress={() => handleShareServer(activeServer)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.88 : 1,
                  })}>
                  <Icon name="share-social-outline" size={18} color="#FFFFFF" />
                  <AppText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                    Invitar personas / Compartir link
                  </AppText>
                </Pressable>
              </View>

              {/* Lista de Canales */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 20 }}>
                {loadingChannels ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
                ) : (
                  <>
                    {/* Canales de Texto */}
                    <View style={{ marginTop: 8, marginBottom: 16 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 6,
                          marginBottom: 6,
                        }}>
                        <AppText
                          variant="caption"
                          color={colors.textFaint}
                          style={{
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: 0.8,
                          }}>
                          Canales de texto ({textChannels.length})
                        </AppText>

                        {isAdmin ? (
                          <Pressable
                            hitSlop={8}
                            onPress={() => {
                              setChannelType('text');
                              setNewChannelModalOpen(true);
                            }}>
                            <Icon name="add" size={18} color={colors.textMuted} />
                          </Pressable>
                        ) : null}
                      </View>

                      {textChannels.map((channel) => (
                        <Pressable
                          key={channel.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push({
                              pathname: '/server/[id]/channel/[channelId]',
                              params: { id: activeServer.id, channelId: channel.id },
                            });
                          }}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            paddingVertical: 9,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                            marginVertical: 1,
                          })}>
                          <AppText style={{ color: colors.textFaint, fontSize: 18, fontWeight: '700' }}>
                            #
                          </AppText>
                          <View style={{ flex: 1 }}>
                            <AppText variant="body" color={colors.text} numberOfLines={1}>
                              {channel.name}
                            </AppText>
                            {channel.topic ? (
                              <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>
                                {channel.topic}
                              </AppText>
                            ) : null}
                          </View>
                        </Pressable>
                      ))}
                    </View>

                    {/* Canales de Voz */}
                    {voiceChannels.length > 0 ? (
                      <View style={{ marginBottom: 16 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 6,
                            marginBottom: 6,
                          }}>
                          <AppText
                            variant="caption"
                            color={colors.textFaint}
                            style={{
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: 0.8,
                            }}>
                            Canales de voz ({voiceChannels.length})
                          </AppText>

                          {isAdmin ? (
                            <Pressable
                              hitSlop={8}
                              onPress={() => {
                                setChannelType('voice');
                                setNewChannelModalOpen(true);
                              }}>
                              <Icon name="add" size={18} color={colors.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>

                        {voiceChannels.map((channel) => (
                          <Pressable
                            key={channel.id}
                            onPress={() => {
                              Alert.alert(
                                'Canal de voz',
                                `Conectando a "${channel.name}". Puedes usar los canales de texto mientras hablas.`,
                              );
                            }}
                            style={({ pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingVertical: 9,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                              marginVertical: 1,
                            })}>
                            <Icon name="volume-medium-outline" size={18} color={colors.textFaint} />
                            <AppText variant="body" color={colors.text} numberOfLines={1}>
                              {channel.name}
                            </AppText>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </View>
          ) : (
            /* ========================================================= */
            /* PANTALLA VACÍA: CREAR O UNIRSE A UN SERVIDOR */
            /* ========================================================= */
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 28,
                gap: 16,
              }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="grid-outline" size={42} color={colors.primary} />
              </View>

              <AppText variant="title" align="center" style={{ fontSize: 22 }}>
                Tu lugar para pasar el rato
              </AppText>

              <AppText
                variant="body"
                color={colors.textMuted}
                align="center"
                style={{ lineHeight: 22 }}>
                Crea servidores al estilo Discord para tu grupo de amigos, gaming o comunidad con
                canales temáticos y enlaces directos para invitar.
              </AppText>

              <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
                <Button
                  title="Crear mi primer servidor"
                  icon="add-circle-outline"
                  size="lg"
                  onPress={() => setCreateModalOpen(true)}
                />

                <Button
                  title="Unirme con enlace o código"
                  icon="compass-outline"
                  variant="secondary"
                  size="lg"
                  onPress={() => setJoinModalOpen(true)}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Menú de Opciones del Servidor */}
      <ActionSheet
        visible={serverOptionsOpen}
        onClose={() => setServerOptionsOpen(false)}
        title={activeServer?.name ?? 'Opciones'}
        options={serverSheetOptions}
      />

      {/* ========================================================= */}
      {/* MODAL: CREAR SERVIDOR */}
      {/* ========================================================= */}
      <Modal
        visible={createModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreateModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}>
            <AppText variant="title" style={{ fontSize: 18 }}>
              Crear tu servidor
            </AppText>
            <Pressable hitSlop={10} onPress={() => setCreateModalOpen(false)}>
              <Icon name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            <AppText color={colors.textMuted} style={{ lineHeight: 21 }}>
              Dale a tu servidor una personalidad con un nombre y un icono. Siempre podrás cambiarlo
              más tarde.
            </AppText>

            {/* Selector de Icono / Avatar */}
            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              <Pressable
                onPress={handlePickServerAvatar}
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: 43,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: colors.border,
                  borderStyle: newServerAvatar ? 'solid' : 'dashed',
                  overflow: 'hidden',
                }}>
                {newServerAvatar ? (
                  <Image
                    source={{ uri: newServerAvatar }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Icon name="camera-outline" size={26} color={colors.primary} />
                    <AppText variant="micro" color={colors.textMuted}>
                      Subir icono
                    </AppText>
                  </View>
                )}
              </Pressable>
            </View>

            <TextField
              label="Nombre del servidor"
              placeholder="Ej. El Club de Redup, Amigos Gaming"
              value={newServerName}
              onChangeText={setNewServerName}
              maxLength={100}
            />

            <TextField
              label="Descripción (opcional)"
              placeholder="¿De qué trata este servidor?"
              value={newServerDesc}
              onChangeText={setNewServerDesc}
              multiline
              maxLength={200}
            />

            <Button
              title="Crear servidor"
              icon="checkmark-circle-outline"
              size="lg"
              loading={createServerMutation.isPending}
              disabled={createServerMutation.isPending || !newServerName.trim()}
              onPress={handleCreateServer}
              style={{ marginTop: 12 }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: UNIRSE A UN SERVIDOR CON ENLACE O CÓDIGO */}
      {/* ========================================================= */}
      <Modal
        visible={joinModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setJoinModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}>
            <AppText variant="title" style={{ fontSize: 18 }}>
              Unirse a un servidor
            </AppText>
            <Pressable hitSlop={10} onPress={() => setJoinModalOpen(false)}>
              <Icon name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            <AppText color={colors.textMuted} style={{ lineHeight: 21 }}>
              Ingresa una invitación para unirte a un servidor existente. Puedes pegar el enlace
              completo o simplemente el código.
            </AppText>

            <TextField
              label="Enlace o código de invitación"
              placeholder="https://redup.app/join/a8f9x2c1 o a8f9x2c1"
              value={joinInput}
              onChangeText={(text) => {
                setJoinInput(text);
                setServerPreview(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Button
              title="Buscar servidor"
              variant="secondary"
              icon="search-outline"
              loading={previewing}
              disabled={!joinInput.trim() || previewing}
              onPress={handleSearchPreview}
            />

            {/* Vista previa del servidor encontrado */}
            {serverPreview ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: 16,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 6,
                }}>
                <Avatar
                  name={serverPreview.name}
                  uri={serverPreview.avatar_path}
                  size={64}
                />

                <View style={{ alignItems: 'center', gap: 4 }}>
                  <AppText variant="title" align="center">
                    {serverPreview.name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} align="center">
                    Creado por {serverPreview.owner_name} · {serverPreview.member_count} miembro
                    {serverPreview.member_count === 1 ? '' : 's'}
                  </AppText>
                  {serverPreview.description ? (
                    <AppText
                      variant="body"
                      color={colors.text}
                      align="center"
                      style={{ marginTop: 4 }}>
                      {serverPreview.description}
                    </AppText>
                  ) : null}
                </View>

                <Button
                  title={serverPreview.already_member ? 'Ya eres miembro (Ir al servidor)' : '¡Unirme al servidor!'}
                  size="lg"
                  icon="enter-outline"
                  loading={joinServerMutation.isPending}
                  onPress={() => handleJoinServer(serverPreview.invite_code)}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: CREAR CANAL NUEVO */}
      {/* ========================================================= */}
      <Modal
        visible={newChannelModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewChannelModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}>
            <AppText variant="title" style={{ fontSize: 18 }}>
              Crear nuevo canal
            </AppText>
            <Pressable hitSlop={10} onPress={() => setNewChannelModalOpen(false)}>
              <Icon name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            <AppText variant="label" color={colors.textMuted}>
              TIPO DE CANAL
            </AppText>

            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => setChannelType('text')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: channelType === 'text' ? colors.surfaceAlt : 'transparent',
                  borderWidth: 1.5,
                  borderColor: channelType === 'text' ? colors.primary : colors.border,
                }}>
                <AppText style={{ fontSize: 22, color: colors.primary, fontWeight: '700' }}>
                  #
                </AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">Canal de texto</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    Publica mensajes, fotos, memes y opiniones.
                  </AppText>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setChannelType('voice')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: channelType === 'voice' ? colors.surfaceAlt : 'transparent',
                  borderWidth: 1.5,
                  borderColor: channelType === 'voice' ? colors.primary : colors.border,
                }}>
                <Icon name="volume-medium-outline" size={24} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">Canal de voz</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    Pasa el rato hablando por voz y video.
                  </AppText>
                </View>
              </Pressable>
            </View>

            <TextField
              label="Nombre del canal"
              placeholder="ej. memes, charla-general, juegos"
              value={channelName}
              onChangeText={(text) =>
                setChannelName(
                  text
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-_]/g, ''),
                )
              }
              maxLength={64}
            />

            <TextField
              label="Tema o descripción (opcional)"
              placeholder="¿De qué se habla en este canal?"
              value={channelTopic}
              onChangeText={setChannelTopic}
              maxLength={120}
            />

            <Button
              title="Crear canal"
              size="lg"
              loading={createChannelMutation.isPending}
              disabled={createChannelMutation.isPending || !channelName.trim()}
              onPress={handleCreateChannel}
              style={{ marginTop: 12 }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
