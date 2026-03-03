declare module 'react-simple-maps' {
    import { ComponentType, ReactNode, CSSProperties } from 'react';

    interface ProjectionConfig {
        center?: [number, number];
        scale?: number;
        rotate?: [number, number, number];
        parallels?: [number, number];
    }

    interface ComposableMapProps {
        projection?: string;
        projectionConfig?: ProjectionConfig;
        width?: number;
        height?: number;
        style?: CSSProperties;
        className?: string;
        children?: ReactNode;
    }

    interface ZoomableGroupProps {
        center?: [number, number];
        zoom?: number;
        minZoom?: number;
        maxZoom?: number;
        translateExtent?: [[number, number], [number, number]];
        onMoveStart?: (event: any) => void;
        onMove?: (event: any) => void;
        onMoveEnd?: (event: any) => void;
        children?: ReactNode;
    }

    interface GeographiesChildrenProps {
        geographies: any[];
        outline?: any;
        borders?: any;
    }

    interface GeographiesProps {
        geography: string | object;
        children: (data: GeographiesChildrenProps) => ReactNode;
        parseGeographies?: (geographies: any[]) => any[];
    }

    interface GeographyStyleState {
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        outline?: string;
        transition?: string;
        cursor?: string;
        filter?: string;
    }

    interface GeographyStyle {
        default?: GeographyStyleState;
        hover?: GeographyStyleState;
        pressed?: GeographyStyleState;
    }

    interface GeographyProps {
        geography: any;
        style?: GeographyStyle;
        className?: string;
        onClick?: (event: any) => void;
        onMouseEnter?: (event: any) => void;
        onMouseLeave?: (event: any) => void;
        onFocus?: (event: any) => void;
        onBlur?: (event: any) => void;
    }

    interface MarkerProps {
        coordinates: [number, number];
        children?: ReactNode;
        style?: GeographyStyle;
        className?: string;
        onClick?: (event: any) => void;
        onMouseEnter?: (event: any) => void;
        onMouseLeave?: (event: any) => void;
    }

    interface LineProps {
        from: [number, number];
        to: [number, number];
        stroke?: string;
        strokeWidth?: number;
        strokeLinecap?: string;
    }

    interface GraticuleProps {
        stroke?: string;
        strokeWidth?: number;
        step?: [number, number];
    }

    interface SphereProps {
        id?: string;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
    }

    interface AnnotationProps {
        subject: [number, number];
        dx?: number;
        dy?: number;
        connectorProps?: object;
        children?: ReactNode;
    }

    export const ComposableMap: ComponentType<ComposableMapProps>;
    export const ZoomableGroup: ComponentType<ZoomableGroupProps>;
    export const Geographies: ComponentType<GeographiesProps>;
    export const Geography: ComponentType<GeographyProps>;
    export const Marker: ComponentType<MarkerProps>;
    export const Line: ComponentType<LineProps>;
    export const Graticule: ComponentType<GraticuleProps>;
    export const Sphere: ComponentType<SphereProps>;
    export const Annotation: ComponentType<AnnotationProps>;
}
