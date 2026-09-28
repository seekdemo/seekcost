import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import ThemeProvider from "@/components/ThemeProvider";
import I18nProvider from "@/components/I18nProvider";
import "./globals.css";
import "./visual-system.css";

export const metadata: Metadata = {
  title: "SeekCost — Investment Management & Decision Support",
  description: "A private system connecting brokerage data, portfolio costs, investment decisions, execution and review.",
  icons: {
    icon: "/icon.svg",
  },
};

// 内联脚本：在 HTML 渲染前立即应用主题，避免白色闪屏
// 支持 light/dark + custom 主题：从 localStorage 读取自定义颜色并动态注入 CSS 变量
const themeScript = `(function(){try{var d=document.documentElement,t=localStorage.getItem("zb_theme"),presets=["light","dark","emerald","blue","violet","rose","amber","cyan"];if(t&&presets.includes(t)){d.setAttribute("data-theme",t)}else if(t==="custom"){d.setAttribute("data-theme","custom");var c=localStorage.getItem("zb_custom_color")||"#4f46e5";var h=c.replace("#",""),r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);var rf=r/255,gf=g/255,bf=b/255,mx=Math.max(rf,gf,bf),mn=Math.min(rf,gf,bf),ll=(mx+mn)/2,s=0,hu=0;if(mx!==mn){var dd=mx-mn;s=ll>0.5?dd/(2-mx-mn):dd/(mx+mn);if(mx===rf)hu=((gf-bf)/dd+(gf<bf?6:0))/6;else if(mx===gf)hu=((bf-rf)/dd+2)/6;else hu=((rf-gf)/dd+4)/6;hu*=360}function hsl(hh,ss,l){if(ss===0){var v=Math.round(l*255);return[v,v,v]}hh/=360;var q=l<0.5?l*(1+ss):l+ss-l*ss,p=2*l-q;function h2r(t){if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}return[Math.round(h2r(hh+1/3)*255),Math.round(h2r(hh)*255),Math.round(h2r(hh-1/3)*255)]}function toHex(a){return"#"+a.map(function(v){return v.toString(16).padStart(2,"0")}).join("")}function lum(r,g,b){var a=[r,g,b].map(function(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]}var cs=Math.min(s*0.6,0.8),cs2=Math.min(s*0.5,0.7),cs3=Math.min(s*0.45,0.6);var al=hsl(hu,Math.min(s*1.15,1),Math.min(ll+0.12,0.85));var ad=hsl(hu,s,Math.max(ll-0.1,0.15));var pg=hsl(hu,cs,0.04);var st=d.style;st.setProperty("--accent",c);st.setProperty("--accent-light",toHex(al));st.setProperty("--accent-dark",toHex(ad));st.setProperty("--accent-bg","rgba("+r+","+g+","+b+",0.1)");st.setProperty("--accent-bg-hover","rgba("+r+","+g+","+b+",0.2)");st.setProperty("--page-bg",toHex(pg));st.setProperty("--nav-bg","rgba("+pg.join(",")+",0.92)");st.setProperty("--surface",toHex(hsl(hu,cs2,0.08)));st.setProperty("--surface-hover",toHex(hsl(hu,cs2,0.12)));st.setProperty("--surface-alt","rgba("+r+","+g+","+b+",0.05)");var brd=toHex(hsl(hu,cs3,0.16));st.setProperty("--border",brd);st.setProperty("--border-hover",c);st.setProperty("--input-bg",toHex(hsl(hu,cs2,0.07)));st.setProperty("--progress-bg",brd);var bgL=lum(pg[0],pg[1],pg[2]),dk=bgL<0.15;st.setProperty("--text-primary",dk?"#f3f4f6":"#1e293b");st.setProperty("--text-secondary",dk?"#9ca3af":"#64748b");st.setProperty("--text-muted",dk?"#6b7280":"#94a3b8");st.setProperty("--text-on-accent",lum(r,g,b)>0.4?"#1e293b":"#ffffff")}else{d.setAttribute("data-theme","light")}}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-page text-primary antialiased">
        <I18nProvider>
          <ThemeProvider>
            <Navbar />
            <main id="main-content" tabIndex={-1} className="app-main">{children}</main>
            <SiteFooter />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
