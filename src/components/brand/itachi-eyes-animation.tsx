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
  withTiming,
} from 'react-native-reanimated';

type Props = {
  width?: number;
  height?: number;
};

// Aspect ratio ajustado al recorte exacto de los ojos: 227 ancho x 106 alto (~2.14)
const ASPECT_RATIO = 227 / 106;

export function ItachiEyesAnimation({ width = 230, height }: Props) {
  const containerWidth = width;
  const containerHeight = height ?? Math.round(width / ASPECT_RATIO);

  // Progreso de apertura de los ojos: 0 (cerrados) a 1 (abiertos)
  const eyeOpen = useSharedValue(0);
  // Progreso del flujo de sangre de Amaterasu: 0 (sin sangre) a 1 (goteo completo)
  const bloodProgress = useSharedValue(0);

  useEffect(() => {
    // 1. Iniciar con ojos cerrados (400ms de suspenso)
    // 2. Abrir los ojos verticalmente con aceleración anime
    eyeOpen.value = withDelay(
      400,
      withTiming(1, {
        duration: 650,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }),
    );

    // 3. El goteo de sangre comienza cuando los ojos están abiertos
    bloodProgress.value = withDelay(
      1050,
      withTiming(1, {
        duration: 1100,
        easing: Easing.bezier(0.33, 1, 0.68, 1),
      }),
    );

    // Haptics ejecutados de forma 100% segura en el hilo JS (evita cualquier fallo de worklet)
    const t1 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, 1050);

    const t2 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, 2150);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [eyeOpen, bloodProgress]);

  // Estilo animado para los ojos abiertos (se abren verticalmente desde la hendidura)
  const openEyesStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(eyeOpen.value, [0, 0.2, 1], [0, 0.8, 1]),
      transform: [
        {
          scaleY: interpolate(eyeOpen.value, [0, 1], [0.08, 1]),
        },
      ],
    };
  });

  // Estilo animado para las líneas de ojos cerrados (se desvanecen al abrir)
  const closedEyesStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(eyeOpen.value, [0, 0.4], [1, 0]),
      transform: [
        {
          scaleY: interpolate(eyeOpen.value, [0, 0.4], [1, 0.2]),
        },
      ],
    };
  });

  // Contenedor de la sangre: fluye hacia abajo
  const bloodStyle = useAnimatedStyle(() => {
    // El goteo de sangre ocurre en el tercio inferior del ojo izquierdo
    // Inicio del goteo alrededor del 32% de la altura
    const startY = containerHeight * 0.32;
    const maxBloodH = containerHeight * 0.68;
    const currentH = interpolate(bloodProgress.value, [0, 1], [0, maxBloodH]);

    return {
      top: startY,
      height: currentH,
      opacity: interpolate(bloodProgress.value, [0, 0.05], [0, 1]),
    };
  });

  return (
    <View
      style={[
        styles.container,
        {
          width: containerWidth,
          height: containerHeight,
        },
      ]}>
      {/* Ojos cerrados (líneas de pestañas en reposo) */}
      <Animated.View style={[StyleSheet.absoluteFill, closedEyesStyle]}>
        <Image
          source={require('../../../assets/images/itachi-eyes-closed.png')}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      </Animated.View>

      {/* Ojos abiertos (Mangekyō Sharingan + 3-tomoe Sharingan) */}
      <Animated.View style={[StyleSheet.absoluteFill, openEyesStyle]}>
        <Image
          source={require('../../../assets/images/itachi-eyes-open.png')}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      </Animated.View>

      {/* Flujo de sangre de Amaterasu que brota del ojo izquierdo */}
      <Animated.View style={[styles.bloodClipper, bloodStyle]}>
        <Image
          source={require('../../../assets/images/itachi-eyes-blood.png')}
          style={{
            position: 'absolute',
            top: -containerHeight * 0.32,
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
    backgroundColor: 'transparent', // Sin fondo negro: se funde con el tema de la pantalla
    alignSelf: 'center',
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bloodClipper: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 10,
  },
});
