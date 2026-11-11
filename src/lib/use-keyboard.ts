import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/**
 * Devuelve la altura actual del teclado virtual en dp/pt.
 * Funciona de forma consistente tanto en iOS como en Android 15/16 con Edge-to-Edge habilitado
 * (donde `adjustResize` no redimensiona automáticamente la ventana raíz).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const onShow = (e: any) => {
      const nextHeight = Math.max(0, e?.endCoordinates?.height ?? 0);
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {
        // LayoutAnimation fallback en Android/Fabric
      }
      setHeight(nextHeight);
    };

    const onHide = () => {
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {
        // LayoutAnimation fallback en Android/Fabric
      }
      setHeight(0);
    };

    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];

    return () => {
      for (const sub of subs) {
        sub.remove();
      }
    };
  }, []);

  return height;
}

const focusListeners = new Set<() => void>();

export function notifyInputFocused() {
  for (const listener of focusListeners) {
    listener();
  }
}

/**
 * Hook para formularios dentro de un `ScrollView`:
 * mide la posición en pantalla del `TextInput` enfocado (`measureInWindow`) cuando se abre el teclado
 * o cambia el foco, y desplaza automáticamente el `ScrollView` para que el campo nunca quede tapado.
 */
export function useKeyboardAutoScroll() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollToFocusedInput = useCallback((kbHeight?: number) => {
    const activeKbHeight = kbHeight ?? keyboardHeightRef.current;
    if (activeKbHeight <= 0) return;

    const focused = TextInput.State?.currentlyFocusedInput?.();
    if (!focused || typeof focused.measureInWindow !== 'function') return;

    focused.measureInWindow((_x, y, _width, height) => {
      if (!height) return;
      const windowHeight = Dimensions.get('window').height;
      const keyboardTop = windowHeight - activeKbHeight;
      const safeBottom = keyboardTop - 36;
      const inputBottom = y + height;

      if (inputBottom > safeBottom) {
        const delta = inputBottom - safeBottom;
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollYRef.current + delta),
          animated: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    const onShow = (e: any) => {
      const nextHeight = Math.max(0, e?.endCoordinates?.height ?? 0);
      keyboardHeightRef.current = nextHeight;
      setKeyboardHeight(nextHeight);
      setTimeout(() => scrollToFocusedInput(nextHeight), 50);
    };

    const onHide = () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    };

    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];

    const onInputFocus = () => {
      setTimeout(() => scrollToFocusedInput(), 70);
      setTimeout(() => scrollToFocusedInput(), 280);
    };
    focusListeners.add(onInputFocus);

    return () => {
      for (const sub of subs) {
        sub.remove();
      }
      focusListeners.delete(onInputFocus);
    };
  }, [scrollToFocusedInput]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onTouchEndCapture = useCallback(() => {
    if (keyboardHeightRef.current > 0) {
      setTimeout(() => scrollToFocusedInput(), 80);
    }
  }, [scrollToFocusedInput]);

  return {
    scrollRef,
    keyboardHeight,
    onScroll,
    onTouchEndCapture,
    scrollToFocusedInput,
  };
}
