import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { useTheme } from '@/theme';

type LegalTab = 'privacy' | 'terms' | 'community';

export default function LegalScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<LegalTab>('privacy');

  return (
    <Screen edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Icon name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="subtitle" style={{ fontSize: 19 }}>
          Información Legal y Normas
        </AppText>
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
        <TabButton
          label="Privacidad"
          active={tab === 'privacy'}
          onPress={() => setTab('privacy')}
        />
        <TabButton
          label="Términos"
          active={tab === 'terms'}
          onPress={() => setTab('terms')}
        />
        <TabButton
          label="Comunidad (UGC)"
          active={tab === 'community'}
          onPress={() => setTab('community')}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
        {tab === 'privacy' && <PrivacyContent />}
        {tab === 'terms' && <TermsContent />}
        {tab === 'community' && <CommunityContent />}
      </ScrollView>
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: active ? colors.primary : colors.surfaceAlt,
      }}>
      <AppText
        variant="caption"
        style={{
          color: active ? '#FFFFFF' : colors.textMuted,
          fontWeight: active ? '700' : '500',
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginBottom: 16,
        padding: 18,
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 8,
      }}>
      <AppText variant="subtitle" style={{ fontSize: 16, fontWeight: '700' }}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function PrivacyContent() {
  const { colors } = useTheme();
  return (
    <View>
      <SectionCard title="1. Compromiso de Privacidad">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          En Redup la privacidad es un principio rector de diseño. Recopilamos únicamente
          los datos imprescindibles para brindarte mensajería en tiempo real y llamadas de audio/video.
          No vendemos tu información personal a terceros ni utilizamos tus mensajes para fines publicitarios.
        </AppText>
      </SectionCard>

      <SectionCard title="2. Información que Recopilamos">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          • <AppText style={{ fontWeight: '600' }}>Cuenta:</AppText> Tu correo electrónico verificado, nombre de usuario público (@username) y nombre visible.{'\n'}
          • <AppText style={{ fontWeight: '600' }}>Mensajes y Medios:</AppText> Mensajes, audios y fotos compartidos en tus conversaciones privadas y grupales.{'\n'}
          • <AppText style={{ fontWeight: '600' }}>Notificaciones Push:</AppText> Token de notificación de tu dispositivo para avisarte de llamadas y mensajes entrantes.
        </AppText>
      </SectionCard>

      <SectionCard title="3. Tus Derechos y Eliminación de Cuenta">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          En cumplimiento con el RGPD, CCPA y los estándares de App Store (Guideline 5.1.1),
          puedes eliminar tu cuenta desde Ajustes &gt; Eliminar mi cuenta. Se borrarán tu perfil,
          avatar, estados, tokens y el contenido de los mensajes que hayas enviado. En las
          conversaciones de otras personas esos mensajes aparecerán como eliminados. Podemos
          conservar copias de seguridad cifradas durante el periodo de retención del proveedor
          antes de su purga definitiva.
        </AppText>
      </SectionCard>

      <SectionCard title="4. Contacto de Privacidad">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          Para cualquier duda sobre el tratamiento de tus datos personales, puedes comunicarte con nuestro
          oficial de privacidad en <AppText color={colors.primary}>privacidad@redup.app</AppText>.
        </AppText>
      </SectionCard>
    </View>
  );
}

function TermsContent() {
  const { colors } = useTheme();
  return (
    <View>
      <SectionCard title="1. Aceptación de los Términos">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          Al registrarte o utilizar Redup, aceptas cumplir estos Términos de Servicio. Si no estás de
          acuerdo con alguna de estas disposiciones, te solicitamos no utilizar la plataforma.
        </AppText>
      </SectionCard>

      <SectionCard title="2. Uso Aceptable del Servicio">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          Te comprometes a utilizar Redup únicamente para fines lícitos y personales. Queda estrictamente
          prohibido:{'\n'}
          • Intentar vulnerar, descompilar o interferir con la infraestructura técnica del servicio.{'\n'}
          • Utilizar clientes automatizados o bots no autorizados.{'\n'}
          • Transmitir malware, virus o enlaces fraudulentos (phishing).
        </AppText>
      </SectionCard>

      <SectionCard title="3. Suspensión y Terminación">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          Nos reservamos el derecho de suspender o revocar el acceso a cualquier cuenta que infrinja estos
          Términos de Servicio o las Normas de la Comunidad, sin perjuicio de las acciones legales pertinentes.
        </AppText>
      </SectionCard>
    </View>
  );
}

function CommunityContent() {
  const { colors } = useTheme();
  return (
    <View>
      <SectionCard title="Tolerancia Cero al Contenido Abusivo (Apple Guideline 1.2)">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          Redup mantiene una política de <AppText style={{ fontWeight: '700', color: colors.danger }}>Tolerancia Cero</AppText> contra
          el contenido objetable, el acoso y los usuarios abusivos. No toleramos:{'\n\n'}
          1. <AppText style={{ fontWeight: '600' }}>Acoso y Hostigamiento:</AppText> Amenazas, insultos, intimidación o persecución.{'\n'}
          2. <AppText style={{ fontWeight: '600' }}>Explotación Infantil (CSAM):</AppText> Cualquier material de abuso o explotación sexual infantil será denunciado de inmediato ante las autoridades policiales competentes.{'\n'}
          3. <AppText style={{ fontWeight: '600' }}>Incitación al Odio y Violencia:</AppText> Discriminación por motivos de raza, etnia, religión, género u orientación sexual.{'\n'}
          4. <AppText style={{ fontWeight: '600' }}>Spam y Fraude:</AppText> Estafas financieras o envío masivo no solicitado.
        </AppText>
      </SectionCard>

      <SectionCard title="Mecanismos de Protección Integrados">
        <AppText color={colors.textMuted} style={{ lineHeight: 22 }}>
          • <AppText style={{ fontWeight: '600' }}>Bloqueo Inmediato:</AppText> Puedes bloquear a cualquier usuario desde su perfil o chat para impedir que vuelva a comunicarse contigo.{'\n'}
          • <AppText style={{ fontWeight: '600' }}>Reporte de Contenido:</AppText> Puedes denunciar mensajes, estados o perfiles en cualquier momento. Nuestro equipo de moderación revisa y actúa sobre los reportes en un plazo inferior a 24 horas.{'\n'}
          • <AppText style={{ fontWeight: '600' }}>Soporte Directo:</AppText> Para reportes urgentes o apelaciones, escribe a <AppText color={colors.primary}>soporte@redup.app</AppText>.
        </AppText>
      </SectionCard>
    </View>
  );
}
