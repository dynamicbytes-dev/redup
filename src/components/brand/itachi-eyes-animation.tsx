import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  width?: number;
  height?: number;
  onFinished?: () => void;
};

// Relación de aspecto original del arte: 235 de ancho por 205 de alto (~1.146)
const ASPECT_RATIO = 235 / 205;

export function ItachiEyesAnimation({ width = 280, height, onFinished }: Props) {
  const containerWidth = width;
  const containerHeight = height ?? Math.round(width / ASPECT_RATIO);

  // Progreso de apertura de párpados: 0 (cerrados) a 1 (completamente abiertos)
  const eyeOpen = useSharedValue(0);
  // Progreso del flujo de sangre de Amaterasu: 0 (sin sangre) a 1 (goteo completo)
  const bloodProgress = useSharedValue(0);
  // Pulso de resplandor carmesí del Mangekyō Sharingan
  const auraOpacity = useSharedValue(0);

  useEffect(() => {
    // 1. Iniciar con ojos cerrados (400ms de suspenso en penumbra)
    // 2. Abrir los ojos con aceleración dramática (anime snap)
    eyeOpen.value = withDelay(
      450,
      withTiming(1, {
        duration: 750,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }, (finished) => {
        if (finished) {
          // Haptic sutil al abrir los ojos
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
      }),
    );

    // 3. Aura siniestra que pulsa al despertar el Mangekyō
    auraOpacity.value = withDelay(
      850,
      withSequence(
        withTiming(0.85, { duration: 400, easing: Easing.out(Easing.quad) }),
        withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      ),
    );

    // 4. El sangrado de Amaterasu comienza en el párpado inferior y fluye hacia abajo
    bloodProgress.value = withDelay(
      1150,
      withTiming(1, {
        duration: 1300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }, (finished) => {
        if (finished) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          if (onFinished) {
            onFinished();
          }
        }
      }),
    );
  }, [eyeOpen, bloodProgress, auraOpacity, onFinished]);

  // Estilo animado para el párpado superior (se eleva)
  const topLidStyle = useAnimatedStyle(() => {
    // Posición Y de los ojos: centro vertical relativo (~48% de la altura)
    const eyeCenterY = containerHeight * 0.48;
    const translateY = interpolate(eyeOpen.value, [0, 1], [0, -eyeCenterY]);
    return {
      transform: [{ translateY }],
    };
  });

  // Estilo animado para el párpado inferior (desciende ligeramente)
  const bottomLidStyle = useAnimatedStyle(() => {
    const eyeCenterY = containerHeight * 0.48;
    const translateY = interpolate(eyeOpen.value, [0, 1], [0, containerHeight - eyeCenterY]);
    return {
      transform: [{ translateY }],
    };
  });

  // Línea de la hendidura del párpado cerrado
  const creaseLineStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(eyeOpen.value, [0, 0.3], [1, 0]),
    };
  });

  // Contenedor que recorta la sangre haciéndola fluir hacia abajo
  const bloodContainerStyle = useAnimatedStyle(() => {
    // La sangre empieza aproximadamente al 55% de la altura y fluye hasta el 90%
    const startY = containerHeight * 0.54;
    const maxBloodHeight = containerHeight * 0.40;
    const currentHeight = interpolate(bloodProgress.value, [0, 1], [0, maxBloodHeight]);

    return {
      top: startY,
      height: currentHeight,
      opacity: interpolate(bloodProgress.value, [0, 0.08], [0, 1]),
    };
  });

  // Resplandor carmesí animado
  const glowStyle = useAnimatedStyle(() => {
    return {
      opacity: auraOpacity.value,
    };
  });

  return (
    <View
      style={[
        styles.container,
        { width: containerWidth, height: containerHeight },
      ]}>
      {/* Resplandor carmesí de fondo (Amaterasu chakra) */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: containerWidth * 0.45,
            height: containerWidth * 0.45,
            left: containerWidth * 0.05,
            top: containerHeight * 0.25,
          },
          glowStyle,
        ]}
      />

      {/* Capa base de los ojos (abiertos) */}
      <Image
        source={require('../../../assets/images/itachi-eyes-base.png')}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
      />

      {/* Párpado superior (animado) */}
      <Animated.View
        style={[
          styles.lid,
          {
            top: 0,
            height: containerHeight * 0.48,
          },
          topLidStyle,
        ]}
      />

      {/* Párpado inferior (animado) */}
      <Animated.View
        style={[
          styles.lid,
          {
            top: containerHeight * 0.48,
            height: containerHeight * 0.52,
          },
          bottomLidStyle,
        ]}
      />

      {/* Línea sutil de párpados cerrados en reposo */}
      <Animated.View
        style={[
          styles.creaseLine,
          {
            top: containerHeight * 0.48 - 1,
            width: containerWidth * 0.88,
          },
          creaseLineStyle,
        ]}
      />

      {/* Capa de sangre con máscara de flujo hacia abajo */}
      <Animated.View style={[styles.bloodClipContainer, bloodContainerStyle]}>
        <Image
          source={require('../../../assets/images/itachi-eyes-blood.png')}
          style={{
            position: 'absolute',
            top: -containerHeight * 0.54,
            width: containerWidth,
            height: containerHeight,
          }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    alignSelf: 'center',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(220, 38, 38, 0.35)',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 30,
  },
  lid: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    zIndex: 10,
  },
  creaseLine: {
    position: 'absolute',
    height: 1.5,
    backgroundColor: 'rgba(50, 50, 60, 0.65)',
    zIndex: 15,
    borderRadius: 1,
  },
  bloodClipContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 20,
  },
});
