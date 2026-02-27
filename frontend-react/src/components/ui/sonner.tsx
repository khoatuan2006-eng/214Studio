"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="dark"
			className="toaster group"
			position="bottom-right"
			offset={16}
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:bg-neutral-800 group-[.toaster]:text-neutral-100 group-[.toaster]:border-neutral-700 group-[.toaster]:shadow-xl group-[.toaster]:backdrop-blur-md",
					description: "group-[.toast]:text-neutral-400",
					actionButton:
						"group-[.toast]:bg-indigo-600 group-[.toast]:text-white",
					cancelButton:
						"group-[.toast]:bg-neutral-700 group-[.toast]:text-neutral-300",
				},
			}}
			expand={false}
			richColors
			{...props}
		/>
	);
};

export { Toaster };
