import logoDarkUrl from '../../../assets/logo/logo-dark.svg?url';
import logoLightUrl from '../../../assets/logo/logo-light.svg?url';

interface LogoProps {
  readonly theme: 'light' | 'dark';
  readonly class?: string;
}

export const Logo = (props: LogoProps) => (
  <img
    class={props.class ?? 'folea-logo'}
    src={props.theme === 'dark' ? logoDarkUrl : logoLightUrl}
    alt="folea"
    draggable={false}
  />
);
