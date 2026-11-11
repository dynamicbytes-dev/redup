export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  about: string | null;
  last_seen_at: string | null;
  created_at: string;
  show_online?: boolean;
  read_receipts?: boolean;
};

export type PrivacySettings = {
  showOnline: boolean;
  readReceipts: boolean;
};

export type BlockedUser = {
  blocked_id: string;
  created_at: string;
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'about'> | null;
};

export type ConversationType = 'direct' | 'group';
export type MemberRole = 'member' | 'admin';

export type ConversationOverview = {
  id: string;
  type: ConversationType;
  name: string | null;
  avatar_path: string | null;
  last_message_at: string;
  last_message_body: string | null;
  last_message_kind: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
  unread_count: number;
  member_count: number;
  other_user_id: string | null;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_path: string | null;
  other_last_seen_at: string | null;
  muted_until: string | null;
  my_role: MemberRole | null;
  last_read_at: string | null;
};

export type MessageKind = 'text' | 'image' | 'audio' | 'file' | 'system';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  media_meta: Record<string, unknown> | null;
  duration_ms: number | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

/** Mensaje con estado local (envío optimista) */
export type ChatMessage = Message & {
  pending?: boolean;
  failed?: boolean;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  last_read_at: string | null;
  muted_until: string | null;
  profile: Pick<
    Profile,
    | 'id'
    | 'username'
    | 'display_name'
    | 'avatar_path'
    | 'about'
    | 'last_seen_at'
    | 'show_online'
    | 'read_receipts'
  > | null;
};

export type ContactDetail = {
  profile: Profile;
  alias: string | null;
  blocked: boolean;
};

export type UserSearchResult = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  about: string | null;
};

export type StatusKind = 'text' | 'image';

export type StatusViewer = {
  viewer_id: string;
  viewed_at: string;
  reaction?: string | null;
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'> | null;
};

export type StoryReplyMeta = {
  status_id: string;
  kind: StatusKind;
  caption: string | null;
  media_path: string | null;
  bg_color: string;
  author_name?: string | null;
};

export type StatusItem = {
  id: string;
  user_id: string;
  kind: StatusKind;
  caption: string | null;
  bg_color: string;
  media_path: string | null;
  created_at: string;
  expires_at: string;
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'> | null;
  viewers: StatusViewer[];
  viewedByMe: boolean;
};

export type StatusAuthorGroup = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  latestAt: string;
  hasUnviewed: boolean;
  items: StatusItem[];
};

export type CallKind = 'voice' | 'video';
export type CallStatus = 'ringing' | 'ongoing' | 'completed' | 'missed' | 'declined';

export type CallLogItem = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string | null;
  kind: CallKind;
  status: CallStatus;
  room_name: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number;
  caller: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'> | null;
  callee: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'> | null;
  conversation: {
    id: string;
    type: ConversationType;
    name: string | null;
    avatar_path: string | null;
  } | null;
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export type FriendRequestItem = {
  id: string;
  sender_id: string;
  receiver_id: string;
  pair_key: string;
  status: FriendRequestStatus;
  created_at: string;
  updated_at: string;
  other: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'about'>;
  direction: 'incoming' | 'outgoing';
};

// ------------------------------------------------------------
// Servidores estilo Discord (Servers, Channels, Members, Messages)
// ------------------------------------------------------------
export type ServerRole = 'owner' | 'admin' | 'moderator' | 'member';
export type ChannelType = 'text' | 'voice';

export type Server = {
  id: string;
  name: string;
  description: string | null;
  avatar_path: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
  my_role?: ServerRole;
  member_count?: number;
};

export type ServerMember = {
  server_id: string;
  user_id: string;
  role: ServerRole;
  nickname: string | null;
  joined_at: string;
  profile: Pick<
    Profile,
    'id' | 'username' | 'display_name' | 'avatar_path' | 'about' | 'last_seen_at' | 'show_online'
  > | null;
};

export type ServerChannel = {
  id: string;
  server_id: string;
  name: string;
  topic: string | null;
  type: ChannelType;
  position: number;
  created_at: string;
};

export type ServerChannelMessage = {
  id: string;
  channel_id: string;
  server_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  media_meta: Record<string, unknown> | null;
  duration_ms: number | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender_profile?: Pick<
    Profile,
    'id' | 'username' | 'display_name' | 'avatar_path' | 'about' | 'last_seen_at' | 'show_online'
  > | null;
  pending?: boolean;
  failed?: boolean;
};

export type ServerPreview = {
  id: string;
  name: string;
  description: string | null;
  avatar_path: string | null;
  invite_code: string;
  member_count: number;
  owner_name: string;
  already_member: boolean;
};
