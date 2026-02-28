import { PixiElements } from '@pixi/react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements extends PixiElements {
            container: any;
            sprite: any;
            graphics: any;
            text: any;
        }
    }
}

declare module 'react/jsx-runtime' {
    namespace JSX {
        interface IntrinsicElements extends PixiElements {
            container: any;
            sprite: any;
            graphics: any;
            text: any;
        }
    }
}

declare module 'react/jsx-dev-runtime' {
    namespace JSX {
        interface IntrinsicElements extends PixiElements {
            container: any;
            sprite: any;
            graphics: any;
            text: any;
        }
    }
}
